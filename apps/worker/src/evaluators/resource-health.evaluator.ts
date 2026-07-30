import { Injectable } from '@nestjs/common';
import { HealthStatus, IncidentSeverity } from '@prisma/client';
import type { FetchedMetricDataPoint } from '@app/cloud-provider';

export interface HealthRuleResult {
  ruleCode: string;
  triggered: boolean;
  health: HealthStatus;
  severity: IncidentSeverity;
  reason: string;
  observedValue: number;
  threshold: number;
}

export interface ResourceHealthEvaluation {
  overallHealth: HealthStatus;
  primaryReason: string;
  ruleResults: HealthRuleResult[];
  latestMetrics: Record<string, number>;
  cpuValue: number | null;
  cpuAverage: number | null;
  statusCheckFailedValue: number | null;
  statusCheckFailedMax: number | null;
}

@Injectable()
export class ResourceHealthEvaluator {
  private readonly cpuThreshold = Number(process.env.EC2_HIGH_CPU_THRESHOLD ?? 85);
  private readonly cpuSustainedCount = Number(process.env.EC2_HIGH_CPU_SUSTAINED_COUNT ?? 3);

  evaluate(fetchedPoints: FetchedMetricDataPoint[]): ResourceHealthEvaluation {
    // Group points by metric name
    const byMetric: Record<string, FetchedMetricDataPoint[]> = {};
    for (const point of fetchedPoints) {
      if (!byMetric[point.metricName]) {
        byMetric[point.metricName] = [];
      }
      byMetric[point.metricName].push(point);
    }

    // Extract latest values for snapshot
    const latestMetrics: Record<string, number> = {};
    for (const [metricName, points] of Object.entries(byMetric)) {
      if (points.length > 0) {
        latestMetrics[metricName] = points[points.length - 1].value;
      }
    }

    const cpuPoints = byMetric['CPUUtilization'] ?? [];
    const statusCheckPoints = byMetric['StatusCheckFailed'] ?? [];

    // Compute sustained CPU: average across all points in the window
    const cpuValues = cpuPoints.map((p) => p.value);
    const cpuAverage =
      cpuValues.length > 0
        ? Number((cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length).toFixed(2))
        : null;

    const cpuLatest = cpuPoints.length > 0 ? cpuPoints[cpuPoints.length - 1].value : null;

    // Compute sustained CPU: count consecutive points above threshold
    let cpuSustainedAbove = 0;
    for (let i = cpuPoints.length - 1; i >= 0; i--) {
      if (cpuPoints[i].value > this.cpuThreshold) {
        cpuSustainedAbove++;
      } else {
        break; // only count consecutive from the end
      }
    }

    const statusCheckValues = statusCheckPoints.map((p) => p.value);
    const statusCheckFailedMax =
      statusCheckValues.length > 0 ? Math.max(...statusCheckValues) : null;
    const statusCheckFailedLatest =
      statusCheckPoints.length > 0 ? statusCheckPoints[statusCheckPoints.length - 1].value : null;

    const ruleResults: HealthRuleResult[] = [];

    // Rule 1: EC2_STATUS_CHECK_FAILED -> SEV1 (Critical)
    const statusFailedTriggered =
      statusCheckFailedMax !== null && statusCheckFailedMax > 0;
    ruleResults.push({
      ruleCode: 'EC2_STATUS_CHECK_FAILED',
      triggered: statusFailedTriggered,
      health: HealthStatus.UNHEALTHY,
      severity: IncidentSeverity.SEV1,
      reason: statusFailedTriggered
        ? `EC2 status check failed (max ${statusCheckFailedMax} failed check(s))`
        : 'Status check passing',
      observedValue: statusCheckFailedMax ?? 0,
      threshold: 0,
    });

    // Rule 2: EC2_HIGH_CPU -> SEV2 (requires sustained condition)
    const cpuTriggered =
      cpuSustainedAbove >= this.cpuSustainedCount;
    const cpuDisplay = cpuAverage !== null ? cpuAverage.toFixed(1) : 'N/A';
    ruleResults.push({
      ruleCode: 'EC2_HIGH_CPU',
      triggered: cpuTriggered,
      health: HealthStatus.DEGRADED,
      severity: IncidentSeverity.SEV2,
      reason: cpuTriggered
        ? `Sustained high CPU utilization (avg ${cpuDisplay}% > ${this.cpuThreshold}% for ${cpuSustainedAbove} points)`
        : cpuAverage !== null
          ? `CPU utilization normal (avg ${cpuDisplay}%)`
          : 'No CPU data available',
      observedValue: cpuAverage ?? 0,
      threshold: this.cpuThreshold,
    });

    // Determine overall health
    let overallHealth: HealthStatus = HealthStatus.HEALTHY;
    let primaryReason = 'All metrics and status checks healthy';

    if (fetchedPoints.length === 0) {
      overallHealth = HealthStatus.UNKNOWN;
      primaryReason = 'No CloudWatch metric data received recently';
    } else if (statusFailedTriggered) {
      overallHealth = HealthStatus.UNHEALTHY;
      primaryReason = `EC2 status check failed (max ${statusCheckFailedMax} failed check(s))`;
    } else if (cpuTriggered) {
      overallHealth = HealthStatus.DEGRADED;
      primaryReason = `Sustained high CPU (avg ${cpuDisplay}% > ${this.cpuThreshold}% for ${cpuSustainedAbove} consecutive points)`;
    }

    return {
      overallHealth,
      primaryReason,
      ruleResults,
      latestMetrics,
      cpuValue: cpuLatest,
      cpuAverage,
      statusCheckFailedValue: statusCheckFailedLatest,
      statusCheckFailedMax,
    };
  }
}
