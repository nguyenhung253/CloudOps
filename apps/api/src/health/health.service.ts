import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import Redis from 'ioredis';

export interface HealthCheck {
  status: 'ok' | 'degraded' | 'error';
  latencyMs?: number;
  message?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  checks: {
    api: HealthCheck;
    database: HealthCheck;
    redis: HealthCheck;
    worker: HealthCheck;
  };
}

export interface VersionInfo {
  version: string;
  gitCommit: string;
  buildTime: string;
  environment: string;
}

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  /** Full health check: API, DB, Redis, and Workers. */
  async check(): Promise<HealthReport> {
    const [db, redis, worker] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkWorkers(),
    ]);

    const checks = { api: { status: 'ok' as const }, database: db, redis, worker };
    const degraded = Object.values(checks).some((c) => c.status === 'error');

    return {
      status: degraded ? 'degraded' : 'ok',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks,
    };
  }

  /** Readiness check: are critical dependencies available? */
  async readiness(): Promise<{ ready: boolean; checks: { database: HealthCheck; redis: HealthCheck } }> {
    const [db, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    return {
      ready: db.status === 'ok' && redis.status === 'ok',
      checks: { database: db, redis },
    };
  }

  /** Version / build info from environment variables. */
  getVersion(): VersionInfo {
    return {
      version: process.env.APP_VERSION ?? '1.0.0',
      gitCommit: process.env.GIT_COMMIT ?? 'unknown',
      buildTime: process.env.BUILD_TIME ?? 'unknown',
      environment: process.env.NODE_ENV ?? 'development',
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (e: any) {
      return { status: 'error', latencyMs: Date.now() - start, message: e?.message };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 0, connectTimeout: 2000 });
    redis.on('error', () => {});
    const start = Date.now();
    try {
      await redis.ping();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (e: any) {
      return { status: 'error', latencyMs: Date.now() - start, message: e?.message };
    } finally {
      redis.disconnect();
    }
  }

  private async checkWorkers(): Promise<HealthCheck> {
    try {
      const active = await this.prisma.workerHeartbeat.count({
        where: {
          lastHeartbeatAt: { gte: new Date(Date.now() - 30_000) },
        },
      });
      if (active > 0) return { status: 'ok', message: `${active} active worker(s)` };
      return { status: 'degraded', message: 'No active workers' };
    } catch {
      return { status: 'error', message: 'Failed to query worker status' };
    }
  }
}
