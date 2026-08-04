import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { QueueService } from '@app/queue';
import { JobStatus } from '@prisma/client';
import { PrometheusService } from '../metrics/prometheus.service';

@Injectable()
export class QueuesService {
  private readonly queueWaitingGauge: ReturnType<PrometheusService['registerGauge']>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly prometheus: PrometheusService,
  ) {
    this.queueWaitingGauge = this.prometheus.registerGauge(
      'queue_waiting_jobs',
      'Number of jobs waiting in queue',
      ['queue'],
    );
  }

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

    // Update Prometheus gauge
    this.queueWaitingGauge.set(
      { queue: 'cloudops-jobs' },
      queueMetrics?.waiting ?? 0,
    );

    return {
      database: { ...statusCounts, total },
      queue: queueMetrics,
    };
  }
}
