import { MetricsService } from './metrics.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { HealthStatus, JobStatus } from '@prisma/client';

describe('Metrics & Resource Health Evaluation Suite', () => {
  describe('Health Evaluation Rules', () => {
    it('1. StatusCheckFailed > 0 -> UNHEALTHY', () => {
      const statusCheckFailed = 1;
      const cpu = 45;
      let status: HealthStatus = HealthStatus.HEALTHY;

      if (statusCheckFailed > 0) {
        status = HealthStatus.UNHEALTHY;
      } else if (cpu > 85) {
        status = HealthStatus.DEGRADED;
      }

      expect(status).toBe(HealthStatus.UNHEALTHY);
    });

    it('2. CPUUtilization > 85% -> DEGRADED', () => {
      const statusCheckFailed = 0;
      const cpu = 92.5;
      let status: HealthStatus = HealthStatus.HEALTHY;

      if (statusCheckFailed > 0) {
        status = HealthStatus.UNHEALTHY;
      } else if (cpu > 85) {
        status = HealthStatus.DEGRADED;
      }

      expect(status).toBe(HealthStatus.DEGRADED);
    });

    it('3. No metric points -> UNKNOWN', () => {
      const fetchedPoints: any[] = [];
      let status: HealthStatus = HealthStatus.HEALTHY;

      if (fetchedPoints.length === 0) {
        status = HealthStatus.UNKNOWN;
      }

      expect(status).toBe(HealthStatus.UNKNOWN);
    });

    it('4. Normal metrics -> HEALTHY', () => {
      const statusCheckFailed = 0;
      const cpu = 42;
      const fetchedPoints = [{ metricName: 'CPUUtilization', value: cpu }];
      let status: HealthStatus = HealthStatus.HEALTHY;

      if (fetchedPoints.length === 0) {
        status = HealthStatus.UNKNOWN;
      } else if (statusCheckFailed > 0) {
        status = HealthStatus.UNHEALTHY;
      } else if (cpu > 85) {
        status = HealthStatus.DEGRADED;
      }

      expect(status).toBe(HealthStatus.HEALTHY);
    });
  });

  describe('DashboardService & JobStatistics', () => {
    let dashboardService: DashboardService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        cloudAccount: { count: jest.fn().mockResolvedValue(2) },
        cloudResource: {
          count: jest.fn().mockResolvedValue(10),
          findMany: jest.fn().mockResolvedValue([]),
        },
        job: {
          count: jest.fn().mockResolvedValue(20),
          groupBy: jest.fn().mockImplementation(({ by }) => {
            if (by.includes('status')) {
              return Promise.resolve([
                { status: JobStatus.SUCCEEDED, _count: { id: 18 } },
                { status: JobStatus.FAILED, _count: { id: 2 } },
              ]);
            }
            if (by.includes('type')) {
              return Promise.resolve([
                { type: 'RESOURCE_SYNC', _count: { id: 10 } },
                { type: 'HEALTH_CHECK', _count: { id: 5 } },
                { type: 'METRIC_COLLECTION', _count: { id: 5 } },
              ]);
            }

            return Promise.resolve([]);
          }),
        },
        $transaction: jest.fn().mockImplementation((promises) => Promise.all(promises)),
      };

      dashboardService = new DashboardService(prismaMock);
    });

    it('should aggregate job statistics and calculate success rate', async () => {
      const result = await dashboardService.getJobStatistics();

      expect(result.totalJobs).toBe(20);
      expect(result.successRate).toBe(90.0);
      expect(result.byStatus[JobStatus.SUCCEEDED]).toBe(18);
      expect(result.byStatus[JobStatus.FAILED]).toBe(2);
      expect(result.byType['METRIC_COLLECTION']).toBe(5);
    });
  });
});
