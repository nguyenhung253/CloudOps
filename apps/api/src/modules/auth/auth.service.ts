import { Injectable, UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@app/database';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole, UserStatus, User, SessionStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

interface RefreshTokenPayload {
  sub: string;
  sid: string;
  tf: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async register(dto: RegisterDto): Promise<User> {
    return this.usersService.create({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
      role: UserRole.VIEWER,
      status: UserStatus.ACTIVE,
    });
  }

  async login(dto: LoginDto, ipAddress: string, userAgent: string) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.LOCKED) {
      throw new ForbiddenException('Your account is locked');
    }

    if (user.status === UserStatus.DISABLED) {
      throw new ForbiddenException('Your account is disabled');
    }

    // Update last login time
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const sessionId = crypto.randomUUID();
    const tokenFamily = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const refreshToken = this.jwtService.sign(
      { sub: user.id, sid: sessionId, tf: tokenFamily },
      { expiresIn: '7d' },
    );

    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash,
        tokenFamily,
        userAgent,
        ipAddress,
        expiresAt,
        status: SessionStatus.ACTIVE,
      },
    });

    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
      },
    };
  }

  async refresh(refreshToken: string, ipAddress: string, userAgent: string) {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken);
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    // If session doesn't exist, or is revoked, or token hash doesn't match
    if (!session || session.tokenHash !== tokenHash) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Reuse detection: if session is already ROTATED, revoke the entire token family
    if (session.status === SessionStatus.ROTATED) {
      await this.prisma.session.updateMany({
        where: { tokenFamily: session.tokenFamily },
        data: {
          status: SessionStatus.REVOKED,
          revokedAt: new Date(),
          revokeReason: 'TOKEN_REUSE_DETECTED',
        },
      });
      throw new UnauthorizedException('Session revoked due to token reuse detection');
    }

    // If session is revoked or expired
    if (session.status === SessionStatus.REVOKED || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = session.user;
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is not active');
    }

    const newSessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const newRefreshToken = this.jwtService.sign(
      { sub: user.id, sid: newSessionId, tf: session.tokenFamily },
      { expiresIn: '7d' },
    );

    const newTokenHash = this.hashToken(newRefreshToken);

    // Rotate token inside a transaction
    await this.prisma.$transaction(async (tx) => {
      // Mark old session as ROTATED
      await tx.session.update({
        where: { id: session.id },
        data: {
          status: SessionStatus.ROTATED,
          revokedAt: new Date(),
          revokeReason: 'TOKEN_ROTATED',
        },
      });

      // Create new session
      await tx.session.create({
        data: {
          id: newSessionId,
          userId: user.id,
          tokenHash: newTokenHash,
          tokenFamily: session.tokenFamily,
          userAgent,
          ipAddress,
          expiresAt,
          status: SessionStatus.ACTIVE,
        },
      });
    });

    const tokenPayload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    };

    const accessToken = this.jwtService.sign(tokenPayload, { expiresIn: '15m' });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken);
    } catch (err) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.session.update({
      where: { id: payload.sid },
      data: {
        status: SessionStatus.REVOKED,
        revokedAt: new Date(),
        revokeReason: 'USER_LOGOUT',
      },
    });
  }
}
