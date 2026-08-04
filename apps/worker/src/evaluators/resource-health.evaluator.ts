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
  memValue: number | null;
  diskValue: number | null;
  statusCheckFailedValue: number | null;
  statusCheckFailedMax: number | null;
}

@Injectable()
export class ResourceHealthEvaluator {
  private readonly cpuThreshold = Number(process.env.EC2_HIGH_CPU_THRESHOLD ?? 85);
  private readonly cpuSustainedCount = Number(process.env.EC2_HIGH_CPU_SUSTAINED_COUNT ?? 3);
  private readonly memThreshold = Number(process.env.EC2_HIGH_MEM_THRESHOLD ?? 85);
  private readonly diskThreshold = Number(process.env.EC2_HIGH_DISK_THRESHOLD ?? 90);

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
    const memPoints = byMetric['mem_used_percent'] ?? [];
    const diskPoints = byMetric['disk_used_percent'] ?? [];

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

    const memLatest = memPoints.length > 0 ? memPoints[memPoints.length - 1].value : null;
    const diskLatest = diskPoints.length > 0 ? diskPoints[diskPoints.length - 1].value : null;

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
    const cpuTriggered = cpuSustainedAbove >= this.cpuSustainedCount;
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

    // Rule 3: EC2_HIGH_MEMORY (CWAgent)
    const memTriggered = memLatest !== null && memLatest > this.memThreshold;
    ruleResults.push({
      ruleCode: 'EC2_HIGH_MEMORY',
      triggered: memTriggered,
      health: memLatest !== null && memLatest > 95 ? HealthStatus.UNHEALTHY : HealthStatus.DEGRADED,
      severity: memLatest !== null && memLatest > 95 ? IncidentSeverity.SEV1 : IncidentSeverity.SEV2,
      reason: memTriggered
        ? `High Memory usage detected (${memLatest.toFixed(1)}% > ${this.memThreshold}%)`
        : memLatest !== null
          ? `Memory usage normal (${memLatest.toFixed(1)}%)`
          : 'No CloudWatch Agent Memory data',
      observedValue: memLatest ?? 0,
      threshold: this.memThreshold,
    });

    // Rule 4: EC2_HIGH_DISK (CWAgent)
    const diskTriggered = diskLatest !== null && diskLatest > this.diskThreshold;
    ruleResults.push({
      ruleCode: 'EC2_HIGH_DISK',
      triggered: diskTriggered,
      health: diskLatest !== null && diskLatest > 98 ? HealthStatus.UNHEALTHY : HealthStatus.DEGRADED,
      severity: diskLatest !== null && diskLatest > 98 ? IncidentSeverity.SEV1 : IncidentSeverity.SEV2,
      reason: diskTriggered
        ? `High Disk space usage detected (${diskLatest.toFixed(1)}% > ${this.diskThreshold}%)`
        : diskLatest !== null
          ? `Disk usage normal (${diskLatest.toFixed(1)}%)`
          : 'No CloudWatch Agent Disk data',
      observedValue: diskLatest ?? 0,
      threshold: this.diskThreshold,
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
    } else if (memLatest !== null && memLatest > 95) {
      overallHealth = HealthStatus.UNHEALTHY;
      primaryReason = `Critical Memory usage (${memLatest.toFixed(1)}% > 95%)`;
    } else if (diskLatest !== null && diskLatest > 98) {
      overallHealth = HealthStatus.UNHEALTHY;
      primaryReason = `Critical Disk space usage (${diskLatest.toFixed(1)}% > 98%)`;
    } else if (cpuTriggered) {
      overallHealth = HealthStatus.DEGRADED;
      primaryReason = `Sustained high CPU (avg ${cpuDisplay}% > ${this.cpuThreshold}% for ${cpuSustainedAbove} consecutive points)`;
    } else if (memTriggered) {
      overallHealth = HealthStatus.DEGRADED;
      primaryReason = `High Memory usage (${memLatest.toFixed(1)}% > ${this.memThreshold}%)`;
    } else if (diskTriggered) {
      overallHealth = HealthStatus.DEGRADED;
      primaryReason = `High Disk space usage (${diskLatest.toFixed(1)}% > ${this.diskThreshold}%)`;
    }

    return {
      overallHealth,
      primaryReason,
      ruleResults,
      latestMetrics,
      cpuValue: cpuLatest,
      cpuAverage,
      memValue: memLatest,
      diskValue: diskLatest,
      statusCheckFailedValue: statusCheckFailedLatest,
      statusCheckFailedMax,
    };
  }
}
