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
        removeOnComplete: 1000,
        removeOnFail: 5000,
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

  async onModuleDestroy() {
    await this.queue.close();
    this.connection.disconnect();
  }
}
