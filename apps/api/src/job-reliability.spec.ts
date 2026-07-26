import {
  classifyJobError,
  NonRetryableJobError,
  RetryableJobError,
} from '@app/queue';



import { JobsService } from './modules/jobs/jobs.service';
import { BadRequestException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';

describe('Reliable Queue & Worker Reliability Tests', () => {
  describe('Error Classification (Retryable vs Non-retryable)', () => {
    it('1. AWS Throttling -> Retryable', () => {
      const result = classifyJobError({ name: 'ThrottlingException', message: 'Rate limit exceeded' });
      expect(result.isRetryable).toBe(true);
    });

    it('2. Network Timeout -> Retryable', () => {
      const result = classifyJobError({ code: 'ETIMEDOUT', message: 'Connection timeout' });
      expect(result.isRetryable).toBe(true);
    });

    it('3. Redis connection error -> Retryable', () => {
      const result = classifyJobError({ code: 'RedisConnectionError', message: 'Redis drop' });
      expect(result.isRetryable).toBe(true);
    });

    it('4. AWS Service Unavailable (503) -> Retryable', () => {
      const result = classifyJobError({ statusCode: 503, message: 'Service Unavailable' });
      expect(result.isRetryable).toBe(true);
    });

    it('5. IAM Role Invalid -> Non-retryable', () => {
      const result = classifyJobError({ code: 'InvalidClientTokenId', message: 'Token invalid' });
      expect(result.isRetryable).toBe(false);
    });

    it('6. Access Denied -> Non-retryable', () => {
      const result = classifyJobError({ code: 'AccessDeniedException', message: 'Access Denied' });
      expect(result.isRetryable).toBe(false);
    });

    it('7. Cloud Account Disabled -> Non-retryable', () => {
      const result = classifyJobError({ code: 'CloudAccountDisabled', message: 'Disabled cloud account' });
      expect(result.isRetryable).toBe(false);
    });

    it('8. Payload Invalid -> Non-retryable', () => {
      const result = classifyJobError({ name: 'BadRequestException', message: 'Invalid payload' });
      expect(result.isRetryable).toBe(false);
    });

    it('9. Resource Request Invalid -> Non-retryable', () => {
      const result = classifyJobError({ code: 'NoSuchEntity', message: 'Not found' });
      expect(result.isRetryable).toBe(false);
    });
  });

  describe('API Requirement & Scenario: User retry job đã thành công', () => {
    let jobsService: JobsService;
    let prismaMock: any;
    let queueServiceMock: any;

    beforeEach(() => {
      prismaMock = {
        job: {
          findUnique: jest.fn(),
          update: jest.fn(),
          findUniqueOrThrow: jest.fn(),
        },
        jobEvent: {
          create: jest.fn(),
        },
      };
      queueServiceMock = {
        enqueue: jest.fn().mockResolvedValue({ id: 'bull-1' }),
      };

      jobsService = new JobsService(prismaMock, queueServiceMock);
    });

    it('Scenario: User retries job that is SUCCEEDED -> Rejects with 400 Bad Request', async () => {
      prismaMock.job.findUnique.mockResolvedValue({
        id: 'job-success-1',
        status: JobStatus.SUCCEEDED,
        requestedBy: 'user-1',
      });

      const actor = { id: 'user-1', role: 'ADMIN' } as any;

      await expect(jobsService.manualRetry('job-success-1', actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('Scenario: User retries FAILED / DLQ job -> Allows retry, updates PENDING, enqueues to BullMQ', async () => {
      const failedJob = {
        id: 'job-failed-1',
        status: JobStatus.FAILED,
        requestedBy: 'user-1',
        attemptsMade: 3,
        maxAttempts: 3,
        type: 'HEALTH_CHECK',
        priority: 0,
        cloudAccountId: 'acc-1',
      };
      prismaMock.job.findUnique.mockResolvedValue(failedJob);
      prismaMock.job.update.mockResolvedValue({
        ...failedJob,
        status: JobStatus.PENDING,
        maxAttempts: 6,
      });
      prismaMock.job.findUniqueOrThrow.mockResolvedValue({
        ...failedJob,
        status: JobStatus.QUEUED,
        maxAttempts: 6,
      });

      const actor = { id: 'user-1', role: 'ADMIN' } as any;
      const result = await jobsService.manualRetry('job-failed-1', actor);

      expect(prismaMock.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-failed-1' },
          data: expect.objectContaining({
            status: JobStatus.PENDING,
            maxAttempts: 6,
          }),
        }),
      );
      expect(queueServiceMock.enqueue).toHaveBeenCalled();
      expect(result.id).toBe('job-failed-1');

    });
  });
});
