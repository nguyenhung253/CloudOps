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
import { WorkerHeartbeatService } from './worker-heartbeat.service';

@Injectable()
export class WorkerConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerConsumer.name);
  private connection: Redis | null = null;
  private worker: Worker<QueueJobPayload> | null = null;

  constructor(
    private readonly processor: JobProcessorService,
    private readonly heartbeat: WorkerHeartbeatService,
  ) {}

  async onModuleInit() {
    this.connection = createRedisConnection();
    const concurrency = Number(process.env.WORKER_CONCURRENCY || 2);

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
        concurrency,
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
      `BullMQ worker listening on queue=${CLOUDOPS_QUEUE_NAME} concurrency=${concurrency} workerId=${this.heartbeat.workerId}`,
    );
  }

  async onModuleDestroy() {
    this.logger.log(`Initiating graceful shutdown for worker ${this.heartbeat.workerId}...`);
    this.heartbeat.setShutdownStatus();

    if (this.worker) {
      // Pause first so no new jobs are picked up
      await this.worker.pause();
      this.logger.log(`Worker paused; waiting for in-flight jobs to complete...`);

      // Close without force — drain in-flight jobs, then ack/nack properly.
      // BullMQ will retry any jobs that were mid-processing if needed.
      await this.worker.close();
      this.logger.log(`BullMQ worker closed gracefully.`);
    }

    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
  }
}
