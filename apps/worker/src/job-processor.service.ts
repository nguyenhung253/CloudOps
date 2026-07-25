import { Injectable, Logger } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { JobLifecycleService } from './job-lifecycle.service';
import { JobHandlerRegistry } from './handlers/job-handler.registry';

@Injectable()
export class JobProcessorService {
  private readonly logger = new Logger(JobProcessorService.name);

  constructor(
    private readonly lifecycle: JobLifecycleService,
    private readonly registry: JobHandlerRegistry,
  ) {}

  /**
   * Process a queue message that only contains jobId.
   * Full state is loaded from PostgreSQL.
   */
  async process(jobId: string): Promise<void> {
    const job = await this.lifecycle.loadJob(jobId);
    if (!job) {
      this.logger.warn(`Job ${jobId} not found in database; acknowledging message`);
      return;
    }

    if (job.status === JobStatus.CANCELLED) {
      await this.lifecycle.markCancelledSkipped(jobId);
      this.logger.log(`Skipping cancelled job ${jobId}`);
      return;
    }

    if (
      job.status === JobStatus.SUCCEEDED ||
      job.status === JobStatus.FAILED ||
      job.status === JobStatus.TIMED_OUT
    ) {
      this.logger.log(`Skipping terminal job ${jobId} status=${job.status}`);
      return;
    }

    const handler = this.registry.get(job.type);
    if (!handler) {
      const { executionId } = await this.lifecycle.markRunning(job);
      await this.lifecycle.markFailed(
        { ...job, attemptsMade: job.attemptsMade },
        executionId,
        {
          message: `No handler registered for job type ${job.type}`,
          code: 'HANDLER_NOT_FOUND',
          type: 'ConfigurationError',
        },
        false,
      );
      return;
    }

    const { job: runningJob, executionId, attemptNumber } =
      await this.lifecycle.markRunning(job);

    try {
      const result = await handler.handle({
        job: runningJob,
        executionId,
        attemptNumber,
        updateProgress: (progress, message) =>
          this.lifecycle.updateProgress(jobId, progress, message),
        isCancelled: () => this.lifecycle.isCancelled(jobId),
      });

      // Re-check cancel before success
      if (await this.lifecycle.isCancelled(jobId)) {
        await this.lifecycle.addEvent(
          jobId,
          'JOB_CANCELLED_AFTER_WORK',
          'Job cancelled after handler finished; leaving CANCELLED status',
          100,
        );
        return;
      }

      await this.lifecycle.markSucceeded(jobId, executionId, result.summary);
      this.logger.log(`Job ${jobId} succeeded type=${job.type}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown job failure';
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined;

      // Refresh attempts after markRunning
      const latest = await this.lifecycle.loadJob(jobId);
      const attemptsMade = latest?.attemptsMade ?? attemptNumber;
      const maxAttempts = latest?.maxAttempts ?? job.maxAttempts;
      const willRetry = attemptsMade < maxAttempts;

      if (latest?.status === JobStatus.CANCELLED) {
        await this.lifecycle.addEvent(
          jobId,
          'JOB_FAILED_WHILE_CANCELLED',
          message,
          latest.progress,
        );
        return;
      }

      await this.lifecycle.markFailed(
        latest ?? runningJob,
        executionId,
        {
          message,
          code,
          type: error instanceof Error ? error.name : 'Error',
        },
        willRetry,
      );

      this.logger.error(
        `Job ${jobId} failed attempt=${attemptsMade}/${maxAttempts}: ${message}`,
      );

      // Let BullMQ retry when appropriate
      if (willRetry) {
        throw error instanceof Error ? error : new Error(message);
      }
    }
  }
}
