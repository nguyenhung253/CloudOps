import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import { QueueService, QUEUE_JOB_NAMES } from '@app/queue';
import { JobStatus, JobType } from '@prisma/client';

@Injectable()
export class MetricSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async onModuleInit() {
    this.timer = setInterval(() => {
      this.triggerScheduledMetricCollection().catch((err) => {
        this.logger.warn(`Scheduled metric collection error: ${err.message}`);
      });
    }, this.intervalMs);
    this.logger.log(`MetricSchedulerService initialized (interval = 5 minutes)`);
  }

  async triggerScheduledMetricCollection(): Promise<number> {
    const activeResources = await this.prisma.cloudResource.findMany({
      where: {
        resourceType: { in: ['EC2_INSTANCE', 'ec2:instance', 'AWS::EC2::Instance', 'ec2'] },

        isActive: true,
      },
      select: { id: true, cloudAccountId: true },
      take: 50,
    });

    if (activeResources.length === 0) {
      return 0;
    }

    let enqueuedCount = 0;
    const accountIds = new Set(activeResources.map((r) => r.cloudAccountId));

    for (const accountId of accountIds) {
      try {
        const job = await this.prisma.job.create({
          data: {
            type: JobType.METRIC_COLLECTION,
            status: JobStatus.PENDING,
            cloudAccountId: accountId,
            payload: { cloudAccountId: accountId, isScheduled: true },
            maxAttempts: 3,
            priority: 0,
          },
        });

        await this.queueService.enqueue(
          QUEUE_JOB_NAMES.METRIC_COLLECTION ?? JobType.METRIC_COLLECTION,
          { jobId: job.id },
          { bullJobId: job.id, attempts: 3 },
        );

        await this.prisma.job.update({
          where: { id: job.id },
          data: { status: JobStatus.QUEUED, queuedAt: new Date() },
        });

        enqueuedCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to enqueue scheduled metric collection for account ${accountId}: ${msg}`);
      }
    }

    this.logger.log(`Scheduled metric collection enqueued ${enqueuedCount} jobs`);
    return enqueuedCount;
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
