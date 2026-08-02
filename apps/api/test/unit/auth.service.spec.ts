import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ApplicationError, ErrorCode } from '@app/common';
import { PrismaService } from '@app/database';
import { AuthService } from '../../src/modules/auth/auth.service';
import { UsersService } from '../../src/modules/users/users.service';
import { UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

describe('AuthService (unit)', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockJwt: any;
  let mockUsersService: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@cloudops.local',
    passwordHash: '',
    fullName: 'Test User',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeAll(async () => {
    mockUser.passwordHash = await argon2.hash('password123');
  });

  beforeEach(async () => {
    mockPrisma = {
      user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    mockJwt = { sign: jest.fn(), verify: jest.fn() };

    mockUsersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      toPublicUser: jest.fn((u) => {
        const { passwordHash: _, ...rest } = u;
        return rest;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'http://localhost:8000') } },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should return access + refresh tokens for valid credentials', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockJwt.sign.mockReturnValueOnce('refresh-token-jwt').mockReturnValueOnce('access-token-jwt');
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.session.create.mockResolvedValue({});

      const result = await service.login(
        { email: 'test@cloudops.local', password: 'password123' },
        '127.0.0.1',
        'test-agent',
      );

      expect(result.accessToken).toBe('access-token-jwt');
      expect(result.refreshToken).toBe('refresh-token-jwt');
      expect(result.user.email).toBe('test@cloudops.local');
    });

    it('should throw INVALID_CREDENTIALS for wrong password', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.login(
          { email: 'test@cloudops.local', password: 'wrong-password' },
          '127.0.0.1',
          'agent',
        ),
      ).rejects.toThrow(ApplicationError);
    });

    it('should throw ACCOUNT_LOCKED for locked users', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        ...mockUser,
        status: UserStatus.LOCKED,
      });

      try {
        await service.login(
          { email: 'test@cloudops.local', password: 'password123' },
          '127.0.0.1',
          'agent',
        );
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.code).toBe(ErrorCode.ACCOUNT_LOCKED);
      }
    });
  });

  describe('refresh', () => {
    it('should rotate token and revoke old session', async () => {
      const session = {
        id: 'session-1',
        userId: mockUser.id,
        tokenHash: service['hashToken']('old-refresh'),
        tokenFamily: 'family-1',
        userAgent: 'agent',
        ipAddress: '127.0.0.1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        user: mockUser,
      };

      mockJwt.verify.mockReturnValue({ sub: mockUser.id, sid: 'session-1', tf: 'family-1' });
      mockPrisma.session.findUnique.mockResolvedValue(session);
      mockJwt.sign.mockReturnValueOnce('new-refresh').mockReturnValueOnce('new-access');
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

      const result = await service.refresh('old-refresh', '127.0.0.1', 'agent');

      expect(result.accessToken).toBe('new-access');
      expect(result.refreshToken).toBe('new-refresh');
    });

    it('should detect refresh token reuse and revoke family', async () => {
      mockJwt.verify.mockReturnValue({ sub: mockUser.id, sid: 'session-1', tf: 'family-1' });
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        tokenHash: service['hashToken']('stolen-token'),
        tokenFamily: 'family-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: new Date(), // Already revoked!
      });
      mockPrisma.session.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

      try {
        await service.refresh('stolen-token', '127.0.0.1', 'agent');
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.code).toBe(ErrorCode.REFRESH_TOKEN_REUSED);
      }
    });
  });
});
