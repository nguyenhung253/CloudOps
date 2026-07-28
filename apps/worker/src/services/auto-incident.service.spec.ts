import { ResourceHealthEvaluator } from '../evaluators/resource-health.evaluator';
import { AutoIncidentService } from './auto-incident.service';
import { HealthStatus, IncidentSeverity, IncidentStatus } from '@prisma/client';

describe('AutoIncidentService & ResourceHealthEvaluator Suite', () => {
  let evaluator: ResourceHealthEvaluator;
  let autoIncidentService: AutoIncidentService;
  let prismaMock: any;
  let notificationDispatcherMock: any;

  beforeEach(() => {
    evaluator = new ResourceHealthEvaluator();

    const mockTx = {
      incident: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      incidentEvidence: {
        create: jest.fn(),
      },
      incidentTimeline: {
        create: jest.fn(),
      },
    };

    prismaMock = {
      $transaction: jest.fn().mockImplementation((cb) => cb(mockTx)),
      _mockTx: mockTx,
    };

    notificationDispatcherMock = {
      dispatchIncidentNotification: jest.fn().mockResolvedValue(undefined),
    };

    autoIncidentService = new AutoIncidentService(
      prismaMock,
      notificationDispatcherMock as any,
    );
  });

  describe('1. ResourceHealthEvaluator', () => {
    it('should evaluate StatusCheckFailed > 0 as UNHEALTHY (SEV1)', () => {
      const points = [
        { metricName: 'StatusCheckFailed', timestamp: new Date(), value: 1 },
        { metricName: 'CPUUtilization', timestamp: new Date(), value: 20 },
      ];

      const res = evaluator.evaluate(points as any);
      expect(res.overallHealth).toBe(HealthStatus.UNHEALTHY);
      const failedRule = res.ruleResults.find((r) => r.ruleCode === 'EC2_STATUS_CHECK_FAILED');
      expect(failedRule?.triggered).toBe(true);
      expect(failedRule?.severity).toBe(IncidentSeverity.SEV1);
    });

    it('should evaluate CPUUtilization > threshold as DEGRADED (SEV2)', () => {
      const points = [
        { metricName: 'StatusCheckFailed', timestamp: new Date(), value: 0 },
        { metricName: 'CPUUtilization', timestamp: new Date(), value: 89.2 },
      ];

      const res = evaluator.evaluate(points as any);
      expect(res.overallHealth).toBe(HealthStatus.DEGRADED);
      const cpuRule = res.ruleResults.find((r) => r.ruleCode === 'EC2_HIGH_CPU');
      expect(cpuRule?.triggered).toBe(true);
      expect(cpuRule?.severity).toBe(IncidentSeverity.SEV2);
    });
  });

  describe('2. AutoIncidentService Deduplication & Transactions', () => {
    it('should create new Incident if no open incident exists for dedupKey', async () => {
      const resource = {
        id: 'res-1',
        name: 'test-ec2',
        providerResourceId: 'i-0123456789',
        cloudAccountId: 'acc-1',
      };

      const points = [
        { metricName: 'StatusCheckFailed', timestamp: new Date(), value: 1 },
      ];
      const evaluation = evaluator.evaluate(points as any);

      prismaMock._mockTx.incident.findFirst.mockResolvedValue(null);
      prismaMock._mockTx.incident.create.mockResolvedValue({
        id: 'inc-100',
        incidentNumber: 992,
        title: 'Status Check Failed',
        status: IncidentStatus.OPEN,
      });

      const count = await autoIncidentService.dispatchForResource(resource, evaluation);

      expect(count).toBe(1);
      expect(prismaMock._mockTx.incident.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dedupKey: 'i-0123456789:EC2_STATUS_CHECK_FAILED',
            createdByType: 'SYSTEM',
            createdBy: null,
          }),
        }),
      );
      expect(prismaMock._mockTx.incidentEvidence.create).toHaveBeenCalled();
      expect(prismaMock._mockTx.incidentTimeline.create).toHaveBeenCalled();
    });

    it('should update occurrenceCount and deduplicate if open incident already exists', async () => {
      const resource = {
        id: 'res-1',
        name: 'test-ec2',
        providerResourceId: 'i-0123456789',
        cloudAccountId: 'acc-1',
      };

      const points = [
        { metricName: 'CPUUtilization', timestamp: new Date(), value: 91.5 },
      ];
      const evaluation = evaluator.evaluate(points as any);

      prismaMock._mockTx.incident.findFirst.mockResolvedValue({
        id: 'inc-100',
        severity: IncidentSeverity.SEV2,
        occurrenceCount: 2,
      });

      const count = await autoIncidentService.dispatchForResource(resource, evaluation);

      expect(count).toBe(1);
      expect(prismaMock._mockTx.incident.create).not.toHaveBeenCalled();
      expect(prismaMock._mockTx.incident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inc-100' },
          data: expect.objectContaining({
            occurrenceCount: 3,
          }),
        }),
      );
    });
  });
});
