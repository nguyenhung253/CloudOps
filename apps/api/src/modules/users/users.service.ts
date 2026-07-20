import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import { User, UserRole, UserStatus, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { CreateUserDto } from './dto/create-user.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

export type PublicUser = Omit<User, 'passwordHash'>;

export interface ListUsersOptions {
  page?: number;
  limit?: number;
  role?: UserRole;
  status?: UserStatus;
  search?: string;
}

export interface AdminActionContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  toPublicUser(user: User): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: dto.email,
          mode: 'insensitive',
        },
      },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);

    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
        status: dto.status,
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  }

  async getByIdOrThrow(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAll(options: ListUsersOptions = {}) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    if (options.role) {
      where.role = options.role;
    }
    if (options.status) {
      where.status = options.status;
    }
    if (options.search) {
      where.OR = [
        { email: { contains: options.search, mode: 'insensitive' } },
        { fullName: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((user) => this.toPublicUser(user)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async updateStatus(
    targetUserId: string,
    status: UserStatus,
    actor: User,
    context: AdminActionContext = {},
  ): Promise<PublicUser> {
    const target = await this.getByIdOrThrow(targetUserId);

    if (target.id === actor.id && status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('You cannot lock or disable your own account');
    }

    if (target.status === status) {
      return this.toPublicUser(target);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: { status },
      });

      // Session model uses revokedAt (null = active) instead of status enum
      if (status === UserStatus.LOCKED || status === UserStatus.DISABLED) {
        await tx.session.updateMany({
          where: {
            userId: target.id,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      }

      return user;
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'USER_STATUS_UPDATED',
      targetType: 'user',
      targetId: target.id,
      requestId: context.requestId,
      metadata: {
        previousStatus: target.status,
        newStatus: status,
        targetEmail: target.email,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.toPublicUser(updated);
  }

  async updateRole(
    targetUserId: string,
    role: UserRole,
    actor: User,
    context: AdminActionContext = {},
  ): Promise<PublicUser> {
    const target = await this.getByIdOrThrow(targetUserId);

    if (target.id === actor.id) {
      throw new ForbiddenException('You cannot change your own role');
    }

    if (target.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: {
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot demote the last active admin');
      }
    }

    if (target.role === role) {
      return this.toPublicUser(target);
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { role },
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'USER_ROLE_UPDATED',
      targetType: 'user',
      targetId: target.id,
      requestId: context.requestId,
      metadata: {
        previousRole: target.role,
        newRole: role,
        targetEmail: target.email,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.toPublicUser(updated);
  }
}
