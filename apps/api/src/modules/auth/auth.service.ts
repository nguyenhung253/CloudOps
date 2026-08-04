import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/database';
import { ApplicationError, ErrorCode, EmailService } from '@app/common';
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

import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly auditLogsService: AuditLogsService,
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

    await this.auditLogsService.create({
      actorUserId: user.id,
      action: 'AUTH_LOGIN',
      targetType: 'user',
      targetId: user.id,
      ipAddress,
      userAgent,
      metadata: { email: user.email, role: user.role },
    });

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
    const now = new Date();

    // Wrapping read-check-write in a single transaction to prevent
    // concurrent reuse from bypassing refresh token rotation detection.
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: payload.sid },
        include: { user: true },
      });

      if (!session || session.tokenHash !== tokenHash) {
        if (payload.tf) {
          await tx.session.updateMany({
            where: { tokenFamily: payload.tf, revokedAt: null },
            data: { revokedAt: now },
          });
        }
        throw new ApplicationError(
        ErrorCode.TOKEN_EXPIRED,
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại',
        401,
      );
    }

      // Already revoked = reuse detected → revoke entire family
      if (session.revokedAt !== null) {
        await tx.session.updateMany({
          where: { tokenFamily: session.tokenFamily, revokedAt: null },
          data: { revokedAt: now },
        });
        throw new ApplicationError(
          ErrorCode.REFRESH_TOKEN_REUSED,
        'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại',
        401,
      );
    }

      if (session.expiresAt < now) {
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
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const newRefreshToken = this.jwtService.sign(
        { sub: user.id, sid: newSessionId, tf: session.tokenFamily },
        { expiresIn: '7d' },
      );

      const newTokenHash = this.hashToken(newRefreshToken);

      // Rotate: revoke old session + create new session atomically
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: now },
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

      return { user, newRefreshToken };
    });

    const tokenPayload: TokenPayload = {
      sub: result.user.id,
      email: result.user.email,
      role: result.user.role,
      status: result.user.status,
    };

    const accessToken = this.jwtService.sign(tokenPayload, { expiresIn: '15m' });

    return {
      accessToken,
      refreshToken: result.newRefreshToken,
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

    await this.auditLogsService.create({
      actorUserId: payload.sub,
      action: 'AUTH_LOGOUT',
      targetType: 'user',
      targetId: payload.sub,
      metadata: { sessionId: payload.sid },
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

  /**
   * Generate a password reset token (JWT, 15min expiry) and "send" it via email.
   * In dev mode with no SMTP configured, the reset link is logged to console.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    // Always return the same message to prevent account enumeration
    if (!user || user.status !== UserStatus.ACTIVE) {
      return { message: 'If an account with that email exists, a password reset link has been sent.' };
    }

    const resetToken = this.jwtService.sign(
      { sub: user.id, purpose: 'password_reset' },
      { expiresIn: '15m' },
    );

    const appUrl = this.configService.get<string>('APP_URL') ?? 'http://localhost:8000';
    const resetLink = `${appUrl}/reset-password?token=${resetToken}`;

    // Try to send via SMTP if configured, otherwise log to console (dev mode)
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    if (smtpHost) {
      try {
        await this.sendResetEmail(user.email, user.fullName, resetLink);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to send reset email: ${msg}`);
        this.logger.log(`[DEV] Password reset link for ${user.email}: ${resetLink}`);
      }
    } else {
      this.logger.log(`[DEV] Password reset link for ${user.email}: ${resetLink}`);
    }

    return { message: 'If an account with that email exists, a password reset link has been sent.' };
  }

  /**
   * Verify reset token and update password.
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwtService.verify<{ sub: string; purpose: string }>(token);
    } catch {
      throw new ApplicationError(
        ErrorCode.TOKEN_EXPIRED,
        'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu link mới.',
        400,
      );
    }

    if (payload.purpose !== 'password_reset') {
      throw new ApplicationError(
        ErrorCode.TOKEN_EXPIRED,
        'Token không hợp lệ',
        400,
      );
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new ApplicationError(
        ErrorCode.RESOURCE_NOT_FOUND,
        'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa',
        400,
      );
    }

    const passwordHash = await argon2.hash(newPassword);

    // Update password + revoke all sessions (force re-login)
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.logger.log(`Password reset successful for user ${user.email}`);

    return { message: 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập bằng mật khẩu mới.' };
  }

  /**
   * Send password reset email via shared EmailService (SMTP).
   * Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM env vars.
   * Falls back to console log if SMTP is not configured.
   */
  private async sendResetEmail(to: string, name: string, resetLink: string): Promise<void> {
    if (!this.emailService.isConfigured()) {
      this.logger.warn('SMTP not configured — reset link logged to console instead');
      this.logger.log(`[DEV] Password reset for ${to}: ${resetLink}`);
      return;
    }

    await this.emailService.send({
      to,
      subject: 'CloudOps — Password Reset',
      text: `Hi ${name},\n\nYou requested a password reset. Click the link below to reset your password (valid for 15 minutes):\n\n${resetLink}\n\nIf you did not request this, please ignore this email.\n\n— CloudOps Team`,
      html: `<p>Hi ${name},</p><p>You requested a password reset. Click the link below to reset your password (valid for <strong>15 minutes</strong>):</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you did not request this, please ignore this email.</p><p>— CloudOps Team</p>`,
    });
  }
}
