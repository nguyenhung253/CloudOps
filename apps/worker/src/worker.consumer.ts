import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker, type Job as BullJob } from 'bullmq';
import type Redis from 'ioredis';
import {
  CLOUDOPS_QUEUE_NAME,
  createRedisConnection,
  type QueueJobPayload,
} from '@app/queue';
import { JobProcessorService } from './job-processor.service';

@Injectable()
export class WorkerConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerConsumer.name);
  private connection: Redis | null = null;
  private worker: Worker<QueueJobPayload> | null = null;

  constructor(private readonly processor: JobProcessorService) {}

  async onModuleInit() {
    this.connection = createRedisConnection();
    this.worker = new Worker<QueueJobPayload>(
      CLOUDOPS_QUEUE_NAME,
      async (bullJob: BullJob<QueueJobPayload>) => {
        const jobId = bullJob.data?.jobId;
        if (!jobId) {
          this.logger.error(
            `Bull job ${bullJob.id} missing data.jobId; payload=${JSON.stringify(bullJob.data)}`,
          );
          return;
        }
        this.logger.log(
          `Consuming bullJob=${bullJob.id} name=${bullJob.name} jobId=${jobId} attempt=${bullJob.attemptsMade + 1}`,
        );
        await this.processor.process(jobId);
      },
      {
        connection: this.connection,
        concurrency: Number(process.env.WORKER_CONCURRENCY || 2),
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`Bull job completed id=${job.id}`);
    });
    this.worker.on('failed', (job, err) => {
      this.logger.warn(
        `Bull job failed id=${job?.id} err=${err?.message}`,
      );
    });
    this.worker.on('error', (err) => {
      this.logger.error(`Worker error: ${err.message}`);
    });

    this.logger.log(
      `BullMQ worker listening on queue=${CLOUDOPS_QUEUE_NAME} concurrency=${process.env.WORKER_CONCURRENCY || 2}`,
    );
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
    this.connection?.disconnect();
  }
}
