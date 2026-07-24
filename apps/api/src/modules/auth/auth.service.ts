import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@app/database';
import { ApplicationError, ErrorCode } from '@app/common';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole, UserStatus, User } from '@prisma/client';
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

  // Session active chỉ khi refresh token chưa revoke và expiresAt chưa hết hạn
  private isSessionActive(session: { revokedAt: Date | null; expiresAt: Date }): boolean {
    return session.revokedAt === null && session.expiresAt >= new Date();
  }

  private async revokeTokenFamily(tokenFamily: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        tokenFamily,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
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
      // Same message for missing user and bad password — avoid account enumeration
      throw new ApplicationError(
        ErrorCode.INVALID_CREDENTIALS,
        'Email hoặc mật khẩu không chính xác',
        401,
      );
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new ApplicationError(
        ErrorCode.INVALID_CREDENTIALS,
        'Email hoặc mật khẩu không chính xác',
        401,
      );
    }

    if (user.status === UserStatus.LOCKED) {
      throw new ApplicationError(
        ErrorCode.ACCOUNT_LOCKED,
        'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên',
        403,
      );
    }

    if (user.status === UserStatus.DISABLED) {
      throw new ApplicationError(
        ErrorCode.ACCOUNT_DISABLED,
        'Tài khoản của bạn đã bị vô hiệu hóa',
        403,
      );
    }

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
      user: this.usersService.toPublicUser(user),
    };
  }

  async refresh(refreshToken: string, ipAddress: string, userAgent: string) {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken);
    } catch {
      throw new ApplicationError(
        ErrorCode.TOKEN_EXPIRED,
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại',
        401,
      );
    }

    const tokenHash = this.hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    if (!session || session.tokenHash !== tokenHash) {
      // Nếu refresh token bị thay đổi thì revoke toàn bộ family
      if (payload.tf) {
        await this.revokeTokenFamily(payload.tf);
      }
      throw new ApplicationError(
        ErrorCode.TOKEN_EXPIRED,
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại',
        401,
      );
    }

    // Nếu refresh token đã bị revoke thì revoke toàn bộ family
    if (session.revokedAt !== null) {
      await this.revokeTokenFamily(session.tokenFamily);
      throw new ApplicationError(
        ErrorCode.REFRESH_TOKEN_REUSED,
        'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại',
        401,
      );
    }

    if (session.expiresAt < new Date()) {
      throw new ApplicationError(
        ErrorCode.TOKEN_EXPIRED,
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại',
        401,
      );
    }

    const user = session.user;
    if (user.status !== UserStatus.ACTIVE) {
      throw new ApplicationError(
        ErrorCode.ACCOUNT_DISABLED,
        'Tài khoản của bạn không còn hoạt động',
        403,
      );
    }

    const newSessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const newRefreshToken = this.jwtService.sign(
      { sub: user.id, sid: newSessionId, tf: session.tokenFamily },
      { expiresIn: '7d' },
    );

    const newTokenHash = this.hashToken(newRefreshToken);

    // Rotate : đánh dấu session cũ đã revoke và tạo session mới
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
        },
      });

      await tx.session.create({
        data: {
          id: newSessionId,
          userId: user.id,
          tokenHash: newTokenHash,
          tokenFamily: session.tokenFamily,
          userAgent,
          ipAddress,
          expiresAt,
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
    } catch {
      // Nếu refresh token đã bị revoke thì logout thành công
      return;
    }

    await this.prisma.session.updateMany({
      where: {
        id: payload.sid,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async logoutAll(userId: string): Promise<{ revokedSessions: number }> {
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { revokedSessions: result.count };
  }
}
