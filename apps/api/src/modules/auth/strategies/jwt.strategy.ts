import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ApplicationError, ErrorCode } from '@app/common';
import { UsersService } from '../../users/users.service';
import { UserStatus } from '@prisma/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>('auth.jwtSecret');
    if (!secret) {
      throw new Error(
        'JWT secret is not configured. Set JWT_SECRET environment variable.',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: unknown) {
    if (!payload || typeof payload !== 'object') {
      throw new ApplicationError(ErrorCode.UNAUTHORIZED, 'Token không hợp lệ', 401);
    }
    const p = payload as Record<string, unknown>;
    if (typeof p.sub !== 'string' || !UUID_RE.test(p.sub)) {
      throw new ApplicationError(ErrorCode.UNAUTHORIZED, 'Token không hợp lệ', 401);
    }

    const user = await this.usersService.findById(p.sub);
    if (!user) {
      throw new ApplicationError(ErrorCode.UNAUTHORIZED, 'Người dùng không tồn tại', 401);
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ApplicationError(ErrorCode.ACCOUNT_DISABLED, 'Tài khoản không còn hoạt động', 403);
    }
    return user;
  }
}
