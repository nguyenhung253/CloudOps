import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { PrometheusService } from '../metrics/prometheus.service';

export interface WorkerInfo {
  workerId: string;
  queueName: string;
  hostname: string | null;
  processId: number | null;
  status: string;
  activeJobs: number;
  lastHeartbeatAt: Date;
  startedAt: Date;
  isAlive: boolean;
}

@Injectable()
export class WorkersService {
  private readonly heartbeatGauge: ReturnType<PrometheusService['registerGauge']>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly prometheus: PrometheusService,
  ) {
    this.heartbeatGauge = this.prometheus.registerGauge(
      'worker_last_heartbeat',
      'Unix timestamp of last worker heartbeat',
      ['worker_id', 'queue_name'],
    );
  }

  async findAll(): Promise<WorkerInfo[]> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    try {
      await this.prisma.workerHeartbeat.deleteMany({
        where: { lastHeartbeatAt: { lt: fiveMinutesAgo } },
      });
    } catch { /* non-blocking cleanup */ }

    const heartbeats = await this.prisma.workerHeartbeat.findMany({
      orderBy: { lastHeartbeatAt: 'desc' },
    });

    const now = Date.now();
    const STALE_THRESHOLD_MS = 30000;

    return heartbeats.map((hb) => {
      const ageMs = now - new Date(hb.lastHeartbeatAt).getTime();
      const isAlive = hb.status !== 'STOPPED' && ageMs <= STALE_THRESHOLD_MS;
      const status = isAlive ? hb.status : 'INACTIVE';

      // Update Prometheus gauge
      this.heartbeatGauge.set(
        { worker_id: hb.workerId, queue_name: hb.queueName },
        new Date(hb.lastHeartbeatAt).getTime() / 1000,
      );

      return {
        workerId: hb.workerId,
        queueName: hb.queueName,
        hostname: hb.hostname,
        processId: hb.processId,
        status,
        activeJobs: hb.activeJobs,
        lastHeartbeatAt: hb.lastHeartbeatAt,
        startedAt: hb.startedAt,
        isAlive,
      };
    });
  }
}
