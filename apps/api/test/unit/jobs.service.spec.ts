import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException }
  from '@nestjs/common';
import { PrismaService } from '@app/database';
import { QueueService } from '@app/queue';
import { JobsService } from '../../src/modules/jobs/jobs.service';
import { PrometheusService } from '../../src/modules/metrics/prometheus.service';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { JobStatus, JobType, UserRole, UserStatus } from '@prisma/client';

describe('JobsService (unit)', () => {
  let service: JobsService;
  let mockPrisma: any;
  let mockQueue: any;

  const mockActor = {
    id: 'user-1',
    email: 'admin@cloudops.local',
    fullName: 'Admin',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    passwordHash: '',
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    mockPrisma = {
      job: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn(),
      },
      jobEvent: { create: jest.fn() },
      cloudAccount: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };

    mockQueue = {
      enqueue: jest.fn(),
      getJobCounts: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QueueService, useValue: mockQueue },
        { provide: PrometheusService,
          useValue: {
            registerCounter: jest.fn(() => ({ inc: jest.fn() })),
            registerGauge: jest.fn(() => ({ set: jest.fn() })),
            registerHistogram: jest.fn(() => ({ observe: jest.fn() })),
          },
        },
        {
          provide: NotificationService,
          useValue: { create: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  describe('createAndEnqueue', () => {
    it('should create job in PENDING state and enqueue to BullMQ', async () => {
      mockPrisma.cloudAccount.findFirst.mockResolvedValue({ id: 'account-1' });
      mockPrisma.job.create.mockResolvedValue({
        id: 'job-1',
        type: JobType.RESOURCE_SYNC,
        status: JobStatus.PENDING,
        cloudAccountId: 'account-1',
      });
      mockQueue.enqueue.mockResolvedValue(undefined);
      mockPrisma.job.findUniqueOrThrow.mockResolvedValue({
        id: 'job-1',
        type: JobType.RESOURCE_SYNC,
        status: JobStatus.QUEUED,
        cloudAccountId: 'account-1',
      });

      const result = await service.createAndEnqueue(
        {
          type: JobType.RESOURCE_SYNC,
          cloudAccountId: 'account-1',
          payload: {},
        },
        mockActor,
      );

      expect(result.accepted).toBe(true);
      expect(result.job.id).toBe('job-1');
    });

    it('should reject job creation for non-MVP job type', async () => {
      await expect(
        service.createAndEnqueue(
          { type: 'LOG_QUERY' as JobType, payload: {} },
          mockActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should cancel a RUNNING job', async () => {
      mockPrisma.job.findUnique.mockResolvedValue({
        id: 'job-1',
        status: JobStatus.RUNNING,
        requestedBy: mockActor.id,
      });
      mockPrisma.job.update.mockResolvedValue({
        id: 'job-1',
        status: JobStatus.CANCELLED,
        cancelledAt: new Date(),
        completedAt: new Date(),
      });

      const result = await service.cancel('job-1', mockActor);
      expect(result.status).toBe(JobStatus.CANCELLED);
    });

    it('should reject cancel on terminal status', async () => {
      mockPrisma.job.findUnique.mockResolvedValue({
        id: 'job-1',
        status: JobStatus.SUCCEEDED,
        requestedBy: mockActor.id,
      });

      await expect(service.cancel('job-1', mockActor)).rejects.toThrow(BadRequestException);
    });
  });
});
