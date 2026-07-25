import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/database';
import {
  ExecutionStatus,
  Job,
  JobStatus,
  Prisma,
} from '@prisma/client';
import * as os from 'os';

@Injectable()
export class JobLifecycleService {
  private readonly logger = new Logger(JobLifecycleService.name);
  readonly workerName: string;

  constructor(private readonly prisma: PrismaService) {
    this.workerName =
      process.env.WORKER_NAME ||
      `worker-${os.hostname()}-${process.pid}`;
  }

  async loadJob(jobId: string): Promise<Job | null> {
    return this.prisma.job.findUnique({ where: { id: jobId } });
  }

  async isCancelled(jobId: string): Promise<boolean> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    return job?.status === JobStatus.CANCELLED;
  }

  /**
   * Mark job RUNNING, bump attempts, create JobExecution + event.
   */
  async markRunning(job: Job): Promise<{
    job: Job;
    executionId: string;
    attemptNumber: number;
  }> {
    const attemptNumber = job.attemptsMade + 1;
    const startedAt = new Date();

    const [updated, execution] = await this.prisma.$transaction([
      this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.RUNNING,
          startedAt: job.startedAt ?? startedAt,
          attemptsMade: attemptNumber,
        },
      }),
      this.prisma.jobExecution.create({
        data: {
          jobId: job.id,
          attemptNumber,
          workerName: this.workerName,
          status: ExecutionStatus.RUNNING,
          startedAt,
        },
      }),
    ]);

    await this.addEvent(
      job.id,
      'JOB_RUNNING',
      `Worker ${this.workerName} started attempt ${attemptNumber}`,
      updated.progress,
      { attemptNumber, workerName: this.workerName, executionId: execution.id },
    );

    return { job: updated, executionId: execution.id, attemptNumber };
  }

  async updateProgress(
    jobId: string,
    progress: number,
    message?: string,
  ): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(progress)));
    await this.prisma.job.update({
      where: { id: jobId },
      data: { progress: clamped },
    });
    if (message) {
      await this.addEvent(jobId, 'JOB_PROGRESS', message, clamped);
    }
  }

  async markSucceeded(
    jobId: string,
    executionId: string,
    resultSummary: Record<string, unknown>,
  ): Promise<void> {
    const finishedAt = new Date();
    const execution = await this.prisma.jobExecution.findUniqueOrThrow({
      where: { id: executionId },
    });
    const durationMs = finishedAt.getTime() - execution.startedAt.getTime();

    await this.prisma.$transaction([
      this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.SUCCEEDED,
          progress: 100,
          completedAt: finishedAt,
          resultSummary: resultSummary as Prisma.InputJsonValue,
        },
      }),
      this.prisma.jobExecution.update({
        where: { id: executionId },
        data: {
          status: ExecutionStatus.SUCCEEDED,
          finishedAt,
          durationMs: BigInt(durationMs),
          output: resultSummary as Prisma.InputJsonValue,
        },
      }),
    ]);

    await this.addEvent(jobId, 'JOB_SUCCEEDED', 'Job completed successfully', 100, {
      executionId,
      durationMs,
    });
  }

  async markFailed(
    job: Job,
    executionId: string,
    error: {
      message: string;
      code?: string;
      type?: string;
      details?: Record<string, unknown>;
    },
    willRetry: boolean,
  ): Promise<void> {
    const finishedAt = new Date();
    const execution = await this.prisma.jobExecution.findUniqueOrThrow({
      where: { id: executionId },
    });
    const durationMs = finishedAt.getTime() - execution.startedAt.getTime();

    const nextStatus = willRetry ? JobStatus.RETRYING : JobStatus.FAILED;

    await this.prisma.$transaction([
      this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: nextStatus,
          completedAt: willRetry ? null : finishedAt,
          resultSummary: {
            lastError: error.message,
            errorCode: error.code ?? null,
          } as Prisma.InputJsonValue,
        },
      }),
      this.prisma.jobExecution.update({
        where: { id: executionId },
        data: {
          status: ExecutionStatus.FAILED,
          finishedAt,
          durationMs: BigInt(durationMs),
          errorCode: error.code ?? 'JOB_FAILED',
          errorType: error.type ?? 'Error',
          errorMessage: error.message,
          errorDetails: (error.details ?? {}) as Prisma.InputJsonValue,
        },
      }),
    ]);

    await this.addEvent(
      job.id,
      willRetry ? 'JOB_RETRYING' : 'JOB_FAILED',
      error.message,
      job.progress,
      {
        executionId,
        willRetry,
        attemptsMade: job.attemptsMade + 1,
        maxAttempts: job.maxAttempts,
      },
    );
  }

  async markCancelledSkipped(jobId: string): Promise<void> {
    await this.addEvent(
      jobId,
      'JOB_SKIPPED_CANCELLED',
      'Worker skipped job because it was cancelled',
      null,
    );
  }

  async addEvent(
    jobId: string,
    eventType: string,
    message: string | null,
    progress: number | null,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await this.prisma.jobEvent.create({
        data: {
          jobId,
          eventType,
          message,
          progress,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to write JobEvent ${eventType} for ${jobId}: ${msg}`);
    }
  }
}
