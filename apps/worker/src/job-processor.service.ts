import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { JobStatus } from '@prisma/client';
import { classifyJobError, RetryableJobError } from '@app/queue';
import { JobLifecycleService } from './job-lifecycle.service';
import { JobHandlerRegistry } from './handlers/job-handler.registry';
import { WorkerHeartbeatService } from './worker-heartbeat.service';

@Injectable()
export class JobProcessorService {
  private readonly logger = new Logger(JobProcessorService.name);
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: JobLifecycleService,
    private readonly registry: JobHandlerRegistry,
    private readonly heartbeat: WorkerHeartbeatService,
  ) {
    this.timeoutMs = Number(process.env.JOB_TIMEOUT_MS || 30000);
  }

  /**
   * Process a queue message containing jobId.
   * Native BullMQ lock is used; full state is loaded from PostgreSQL.
   */
  async process(jobId: string): Promise<void> {
    this.heartbeat.incrementActiveJobs();

    try {
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
        // No handler registered — unrecoverable. Move directly to FAILED/DLQ
        // without creating a useless execution record since no work was attempted.
        await this.prisma.$transaction([
          this.prisma.job.update({
            where: { id: jobId },
            data: { status: JobStatus.FAILED, completedAt: new Date() },
          }),
          this.prisma.jobEvent.create({
            data: {
              jobId,
              eventType: 'MOVED_TO_DLQ',
              message: `Job moved to DLQ: No handler registered for job type ${job.type}`,
              progress: 100,
            },
          }),
        ]);
        this.logger.error(`No handler for job type ${job.type}; moved to DLQ`);
        return;
      }

      const { job: runningJob, executionId, attemptNumber } =
        await this.lifecycle.markRunning(job);

      try {
        // Wrap execution with timeout using AbortController so handlers can stop work
        const abortController = new AbortController();
        let timerId: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timerId = setTimeout(() => {
            abortController.abort();
            reject(
              new RetryableJobError(
                `Job execution timed out after ${this.timeoutMs}ms`,
                'JOB_TIMEOUT',
              ),
            );
          }, this.timeoutMs);
        });

        const handlePromise = handler.handle({
          job: runningJob,
          executionId,
          attemptNumber,
          updateProgress: (progress, message) =>
            this.lifecycle.updateProgress(jobId, progress, message),
          isCancelled: () => this.lifecycle.isCancelled(jobId),
          abortSignal: abortController.signal,
        });

        const result = await Promise.race([handlePromise, timeoutPromise]).finally(
          () => {
            if (timerId) clearTimeout(timerId);
          },
        );

        // Re-check cancel status before completing
        if (await this.lifecycle.isCancelled(jobId)) {
          await this.lifecycle.addEvent(
            jobId,
            'JOB_CANCELLED_AFTER_WORK',
            'Job was cancelled while processing was completing',
            100,
          );
          return;
        }

        await this.lifecycle.markSucceeded(jobId, executionId, result.summary);
        this.logger.log(`Job ${jobId} succeeded type=${job.type}`);
      } catch (error: unknown) {
        const classified = classifyJobError(error);
        const latest = await this.lifecycle.loadJob(jobId);
        const attemptsMade = latest?.attemptsMade ?? attemptNumber;
        const maxAttempts = latest?.maxAttempts ?? job.maxAttempts;

        const isRetryable = classified.isRetryable;
        const hasAttemptsLeft = attemptsMade < maxAttempts;
        const willRetry = isRetryable && hasAttemptsLeft;

        if (latest?.status === JobStatus.CANCELLED) {
          await this.lifecycle.addEvent(
            jobId,
            'JOB_FAILED_WHILE_CANCELLED',
            classified.message,
            latest.progress,
          );
          return;
        }

        if (classified.code === 'JOB_TIMEOUT') {
          await this.lifecycle.markTimedOut(
            latest ?? runningJob,
            executionId,
            this.timeoutMs,
            willRetry,
          );
        } else {
          await this.lifecycle.markFailed(
            latest ?? runningJob,
            executionId,
            {
              message: classified.message,
              code: classified.code,
              type: classified.type,
            },
            willRetry,
          );
        }

        if (!willRetry) {
          // Logical DLQ recording in DB
          await this.lifecycle.addEvent(
            jobId,
            'MOVED_TO_DLQ',
            `Job moved to DLQ. Reason: ${classified.message} (Retryable=${isRetryable}, Attempts=${attemptsMade}/${maxAttempts})`,
            latest?.progress ?? 0,
            {
              isRetryable,
              errorCode: classified.code,
              attemptsMade,
              maxAttempts,
            },
          );
          this.logger.error(
            `Job ${jobId} moved to DLQ (attempts=${attemptsMade}/${maxAttempts}, isRetryable=${isRetryable}): ${classified.message}`,
          );
        } else {
          this.logger.warn(
            `Job ${jobId} failed attempt=${attemptsMade}/${maxAttempts} (retryable): ${classified.message}`,
          );
          // Rethrow so BullMQ handles backoff delay re-execution
          throw error instanceof Error ? error : new Error(classified.message);
        }
      }
    } finally {
      this.heartbeat.decrementActiveJobs();
    }
  }
}
