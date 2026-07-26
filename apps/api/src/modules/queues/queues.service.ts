import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { QueueService } from '@app/queue';
import { JobStatus } from '@prisma/client';

@Injectable()
export class QueuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async getSummary() {
    const grouped = await this.prisma.job.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const statusCounts: Record<string, number> = {
      [JobStatus.PENDING]: 0,
      [JobStatus.QUEUED]: 0,
      [JobStatus.RUNNING]: 0,
      [JobStatus.SUCCEEDED]: 0,
      [JobStatus.FAILED]: 0,
      [JobStatus.RETRYING]: 0,
      [JobStatus.CANCELLED]: 0,
      [JobStatus.TIMED_OUT]: 0,
    };

    let total = 0;
    for (const item of grouped) {
      statusCounts[item.status] = item._count._all;
      total += item._count._all;
    }

    const queueMetrics = await this.queueService.getJobCounts();

    return {
      database: {
        ...statusCounts,
        total,
      },
      queue: queueMetrics,
    };
  }
}
