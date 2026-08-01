import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import { CLOUDOPS_QUEUE_NAME } from '@app/queue';
import * as os from 'os';

@Injectable()
export class WorkerHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  readonly workerId: string;
  readonly queueName = CLOUDOPS_QUEUE_NAME;
  readonly hostname = os.hostname();
  readonly processId = process.pid;
  readonly startedAt = new Date();

  private activeJobsCount = 0;
  private status: 'ALIVE' | 'SHUTTING_DOWN' | 'STOPPED' = 'ALIVE';
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.workerId =
      process.env.WORKER_NAME ||
      `worker-${this.hostname}-${this.processId}`;
  }

  async onModuleInit() {
    await this.sendHeartbeat();
    this.timer = setInterval(() => {
      this.sendHeartbeat().catch((err) => {
        this.logger.warn(`Failed to send worker heartbeat: ${err.message}`);
      });
    }, 10000);
    this.logger.log(`Worker heartbeat started for workerId=${this.workerId}`);
  }

  incrementActiveJobs() {
    this.activeJobsCount++;
  }

  decrementActiveJobs() {
    this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
  }

  getActiveJobsCount(): number {
    return this.activeJobsCount;
  }

  setShutdownStatus() {
    this.status = 'SHUTTING_DOWN';
    this.sendHeartbeat().catch((err) => {
      this.logger.warn(`Failed to send shutdown heartbeat: ${err.message}`);
    });
  }

  private async sendHeartbeat() {
    try {
      await this.prisma.workerHeartbeat.upsert({
        where: { workerId: this.workerId },
        create: {
          workerId: this.workerId,
          queueName: this.queueName,
          hostname: this.hostname,
          processId: this.processId,
          status: this.status,
          activeJobs: this.activeJobsCount,
          lastHeartbeatAt: new Date(),
          startedAt: this.startedAt,
        },
        update: {
          status: this.status,
          activeJobs: this.activeJobsCount,
          lastHeartbeatAt: new Date(),
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Error writing heartbeat to DB: ${msg}`);
    }
  }

  async onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = 'STOPPED';
    try {
      await this.sendHeartbeat();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to send final STOPPED heartbeat: ${msg}`);
    }
  }
}
