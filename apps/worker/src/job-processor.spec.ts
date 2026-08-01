import { JobProcessorService } from './job-processor.service';
import { JobLifecycleService } from './job-lifecycle.service';
import { JobHandlerRegistry } from './handlers/job-handler.registry';
import { WorkerHeartbeatService } from './worker-heartbeat.service';
import { JobStatus, JobType } from '@prisma/client';

describe('JobProcessorService & Reliability Scenarios', () => {
  let processor: JobProcessorService;
  let lifecycleMock: jest.Mocked<JobLifecycleService>;
  let registryMock: jest.Mocked<JobHandlerRegistry>;
  let heartbeatMock: jest.Mocked<WorkerHeartbeatService>;

  beforeEach(() => {
    lifecycleMock = {
      workerName: 'test-worker-1',
      loadJob: jest.fn(),
      isCancelled: jest.fn(),
      markRunning: jest.fn(),
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
      markTimedOut: jest.fn(),
      markCancelledSkipped: jest.fn(),
      addEvent: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as jest.Mocked<JobLifecycleService>;

    registryMock = {
      get: jest.fn(),
    } as unknown as jest.Mocked<JobHandlerRegistry>;

    heartbeatMock = {
      incrementActiveJobs: jest.fn(),
      decrementActiveJobs: jest.fn(),
    } as unknown as jest.Mocked<WorkerHeartbeatService>;

    const prismaMock = {
      job: { update: jest.fn().mockResolvedValue({}) },
      jobEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation((fnOrArray: any) => {
        if (Array.isArray(fnOrArray)) return Promise.all(fnOrArray);
        return fnOrArray(); // interactive transaction callback
      }),
    } as any;

    processor = new JobProcessorService(
      prismaMock,
      lifecycleMock,
      registryMock,
      heartbeatMock,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('Scenario: Worker receives job that was cancelled -> skips processing cleanly', async () => {
    const cancelledJob = {
      id: 'job-cancelled-123',
      type: JobType.RESOURCE_SYNC,
      status: JobStatus.CANCELLED,
      attemptsMade: 0,
      maxAttempts: 3,
    };
    lifecycleMock.loadJob.mockResolvedValue(cancelledJob as any);

    await processor.process('job-cancelled-123');

    expect(lifecycleMock.markCancelledSkipped).toHaveBeenCalledWith('job-cancelled-123');
    expect(registryMock.get).not.toHaveBeenCalled();
  });

  it('Scenario: Non-retryable error (e.g. IAM invalid) -> records DLQ event without re-throwing', async () => {
    const mockJob = {
      id: 'job-iam-fail',
      type: JobType.HEALTH_CHECK,
      status: JobStatus.QUEUED,
      attemptsMade: 0,
      maxAttempts: 3,
      payload: {},
      progress: 0,
    };

    lifecycleMock.loadJob.mockResolvedValue(mockJob as any);
    lifecycleMock.markRunning.mockResolvedValue({
      job: { ...mockJob, status: JobStatus.RUNNING } as any,
      executionId: 'exec-1',
      attemptNumber: 1,
    });

    const handlerMock = {
      handle: jest.fn().mockRejectedValue({
        code: 'InvalidClientTokenId',
        message: 'The security token included in the request is invalid',
      }),
    };
    registryMock.get.mockReturnValue(handlerMock as any);

    // Should NOT throw error to BullMQ, acknowledging message
    await expect(processor.process('job-iam-fail')).resolves.not.toThrow();

    expect(lifecycleMock.markFailed).toHaveBeenCalledWith(
      expect.anything(),
      'exec-1',
      expect.objectContaining({
        code: 'InvalidClientTokenId',
      }),
      false, // willRetry = false
    );
    expect(lifecycleMock.addEvent).toHaveBeenCalledWith(
      'job-iam-fail',
      'MOVED_TO_DLQ',
      expect.stringContaining('DLQ'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('Scenario: AWS throttling error (retryable) -> marks RETRYING and re-throws error for backoff', async () => {
    const mockJob = {
      id: 'job-throttled',
      type: JobType.RESOURCE_SYNC,
      status: JobStatus.QUEUED,
      attemptsMade: 0,
      maxAttempts: 3,
      payload: {},
      progress: 0,
    };

    lifecycleMock.loadJob.mockResolvedValue(mockJob as any);
    lifecycleMock.markRunning.mockResolvedValue({
      job: { ...mockJob, status: JobStatus.RUNNING, attemptsMade: 1 } as any,
      executionId: 'exec-2',
      attemptNumber: 1,
    });

    const throttlingError = {
      name: 'ThrottlingException',
      message: 'Rate exceeded',
    };
    const handlerMock = {
      handle: jest.fn().mockRejectedValue(throttlingError),
    };
    registryMock.get.mockReturnValue(handlerMock as any);

    // Should rethrow so BullMQ applies exponential backoff retry
    await expect(processor.process('job-throttled')).rejects.toThrow();


    expect(lifecycleMock.markFailed).toHaveBeenCalledWith(
      expect.anything(),
      'exec-2',
      expect.objectContaining({
        type: 'ThrottlingException',
      }),
      true, // willRetry = true
    );
  });
});
