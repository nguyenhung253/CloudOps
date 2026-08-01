import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import type Redis from 'ioredis';
import { CLOUDOPS_QUEUE_NAME, type QueueJobName } from './constants';
import { createRedisConnection } from './redis.connection';
import type { QueueJobPayload } from './types';

export interface EnqueueJobOptions {
  /** BullMQ job id — defaults to jobId for idempotent re-enqueue. */
  bullJobId?: string;
  priority?: number;
  attempts?: number;
  backoffMs?: number;
  delayMs?: number;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection: Redis;
  private readonly queue: Queue<QueueJobPayload>;

  constructor() {
    this.connection = createRedisConnection();
    this.queue = new Queue<QueueJobPayload>(CLOUDOPS_QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });
  }

  /**
   * Publish a minimal message; full context lives in PostgreSQL.
   */
  async enqueue(
    name: QueueJobName | string,
    payload: QueueJobPayload,
    options: EnqueueJobOptions = {},
  ) {
    const jobOptions: JobsOptions = {
      jobId: options.bullJobId ?? payload.jobId,
      priority: options.priority,
      attempts: options.attempts,
      delay: options.delayMs,
      backoff:
        options.backoffMs !== undefined
          ? { type: 'exponential', delay: options.backoffMs }
          : undefined,
    };

    const job = await this.queue.add(name, { jobId: payload.jobId }, jobOptions);
    this.logger.debug(`Enqueued ${name} jobId=${payload.jobId} bullId=${job.id}`);
    return job;
  }

  /** @deprecated Prefer enqueue() with typed name + minimal payload. */
  async addJob(name: string, data: QueueJobPayload | Record<string, unknown>) {
    const jobId =
      data && typeof data === 'object' && 'jobId' in data
        ? String((data as QueueJobPayload).jobId)
        : undefined;
    if (!jobId) {
      throw new Error('Queue payload must include jobId');
    }
    return this.enqueue(name, { jobId });
  }

  async getJobCounts() {
    try {
      const counts = await this.queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );
      return {
        name: CLOUDOPS_QUEUE_NAME,
        ...counts,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to fetch Redis queue counts: ${msg}`);
      return {
        name: CLOUDOPS_QUEUE_NAME,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        error: msg,
      };
    }
  }

  /**
   * Upsert a BullMQ Job Scheduler (repeatable job).
   * Creates or updates a repeatable job that fires at the given interval.
   */
  async upsertScheduler(
    key: string,
    name: string,
    intervalMs: number,
    data: QueueJobPayload,
  ): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        key,
        { every: intervalMs },
        { name, data: { jobId: data.jobId } },
      );
      this.logger.debug(`Upserted scheduler key=${key} every=${intervalMs}ms`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to upsert scheduler ${key}: ${msg}`);
      throw err;
    }
  }

  /**
   * Remove a BullMQ Job Scheduler by key.
   */
  async removeScheduler(key: string): Promise<void> {
    try {
      await this.queue.removeJobScheduler(key);
      this.logger.debug(`Removed scheduler key=${key}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to remove scheduler ${key}: ${msg}`);
    }
  }

  async onModuleDestroy() {
    await this.queue.close();
    this.connection.disconnect();
  }

}
