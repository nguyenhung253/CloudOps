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
  statusCheckFailedValue: number | null;
}

@Injectable()
export class ResourceHealthEvaluator {
  private readonly cpuThreshold = Number(process.env.EC2_HIGH_CPU_THRESHOLD ?? 85);

  evaluate(fetchedPoints: FetchedMetricDataPoint[]): ResourceHealthEvaluation {
    const latestMetrics: Record<string, number> = {};
    let cpuValue: number | null = null;
    let statusCheckFailedValue: number | null = null;

    for (const point of fetchedPoints) {
      latestMetrics[point.metricName] = point.value;
      if (point.metricName === 'CPUUtilization') {
        cpuValue = point.value;
      }
      if (point.metricName === 'StatusCheckFailed') {
        statusCheckFailedValue = point.value;
      }
    }

    const ruleResults: HealthRuleResult[] = [];

    // Rule 1: EC2_STATUS_CHECK_FAILED -> SEV1 (Critical)
    const statusFailedTriggered =
      statusCheckFailedValue !== null && statusCheckFailedValue > 0;
    ruleResults.push({
      ruleCode: 'EC2_STATUS_CHECK_FAILED',
      triggered: statusFailedTriggered,
      health: HealthStatus.UNHEALTHY,
      severity: IncidentSeverity.SEV1,
      reason: statusFailedTriggered
        ? `EC2 status check failed (${statusCheckFailedValue} failed check(s))`
        : 'Status check passing',
      observedValue: statusCheckFailedValue ?? 0,
      threshold: 0,
    });

    // Rule 2: EC2_HIGH_CPU -> SEV2 (High)
    const cpuTriggered = cpuValue !== null && cpuValue > this.cpuThreshold;
    const cpuDisplay = cpuValue !== null ? cpuValue.toFixed(1) : 'N/A';
    ruleResults.push({
      ruleCode: 'EC2_HIGH_CPU',
      triggered: cpuTriggered,
      health: HealthStatus.DEGRADED,
      severity: IncidentSeverity.SEV2,
      reason: cpuTriggered
        ? `High CPU utilization (${cpuDisplay}% > ${this.cpuThreshold}%)`
        : `CPU utilization normal (${cpuDisplay}%)`,
      observedValue: cpuValue ?? 0,
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
      primaryReason = `EC2 status check failed (${statusCheckFailedValue} failed check(s))`;
    } else if (cpuTriggered) {
      overallHealth = HealthStatus.DEGRADED;
      primaryReason = `High CPU utilization (${cpuDisplay}% > ${this.cpuThreshold}%)`;
    }

    return {
      overallHealth,
      primaryReason,
      ruleResults,
      latestMetrics,
      cpuValue,
      statusCheckFailedValue,
    };
  }
}
