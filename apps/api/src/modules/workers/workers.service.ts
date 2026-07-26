import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';

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
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<WorkerInfo[]> {
    const heartbeats = await this.prisma.workerHeartbeat.findMany({
      orderBy: { lastHeartbeatAt: 'desc' },
    });

    const now = Date.now();
    const STALE_THRESHOLD_MS = 30000; // 30s threshold

    return heartbeats.map((hb) => {
      const ageMs = now - new Date(hb.lastHeartbeatAt).getTime();
      const isAlive = hb.status !== 'STOPPED' && ageMs <= STALE_THRESHOLD_MS;
      const status = isAlive ? hb.status : 'INACTIVE';

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
