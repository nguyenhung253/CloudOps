import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { HealthStatus, JobStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [cloudAccountsCount, totalResourcesCount, activeResourcesCount, totalJobsCount] =
      await this.prisma.$transaction([
        this.prisma.cloudAccount.count({ where: { deletedAt: null } }),
        this.prisma.cloudResource.count(),
        this.prisma.cloudResource.count({ where: { isActive: true } }),
        this.prisma.job.count(),
      ]);

    const ec2Resources = await this.prisma.cloudResource.findMany({
      where: {
        resourceType: {
          in: ['EC2_INSTANCE', 'ec2:instance', 'AWS::EC2::Instance', 'ec2', 'instance', 'EC2'],
        },
        isActive: true,
      },
      include: {
        healthSnapshots: {
          orderBy: { evaluatedAt: 'desc' },
          take: 1,
        },
      },
    });

    const healthCounts: Record<string, number> = {
      HEALTHY: 0,
      DEGRADED: 0,
      UNHEALTHY: 0,
      UNKNOWN: 0,
    };

    for (const res of ec2Resources) {
      const latest = res.healthSnapshots[0];
      // Default to UNKNOWN — never fake HEALTHY for unevaluated resources
      const status = latest?.status ?? HealthStatus.UNKNOWN;
      healthCounts[status] = (healthCounts[status] || 0) + 1;
    }

    return {
      cloudAccountsCount,
      resources: {
        total: totalResourcesCount,
        active: activeResourcesCount,
        ec2Count: ec2Resources.length,
      },
      healthSummary: {
        ...healthCounts,
        total: ec2Resources.length,
      },
      jobsCount: totalJobsCount,
    };
  }

  async getResourceHealthSummary() {
    const ec2Resources = await this.prisma.cloudResource.findMany({
      where: {
        resourceType: {
          in: ['EC2_INSTANCE', 'ec2:instance', 'AWS::EC2::Instance', 'ec2', 'instance', 'EC2'],
        },
        isActive: true,
      },
      include: {
        cloudAccount: { select: { id: true, name: true, provider: true } },
        healthSnapshots: {
          orderBy: { evaluatedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const healthCounts: Record<string, number> = {
      HEALTHY: 0,
      DEGRADED: 0,
      UNHEALTHY: 0,
      UNKNOWN: 0,
    };

    const items = ec2Resources.map((res) => {
      const latest = res.healthSnapshots[0] ?? null;
      // Default to UNKNOWN — never fake HEALTHY for unevaluated resources
      const status = latest?.status ?? HealthStatus.UNKNOWN;
      healthCounts[status] = (healthCounts[status] || 0) + 1;

      return {
        resourceId: res.id,
        name: res.name,
        providerResourceId: res.providerResourceId,
        region: res.region,
        cloudAccount: res.cloudAccount,
        healthStatus: status,
        reason: latest?.reason ?? 'No metric or health evaluation recorded yet',
        cpuUtilization: latest?.cpuUtilization ?? null,
        statusCheckFailed: latest?.statusCheckFailed ?? null,
        evaluatedAt: latest?.evaluatedAt ?? null,
      };
    });

    return {
      summary: {
        ...healthCounts,
        total: ec2Resources.length,
      },
      resources: items,
    };
  }

  async getJobStatistics() {
    const totalCount = await this.prisma.job.count();
    const statusGrouped = await this.prisma.job.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const typeGrouped = await this.prisma.job.groupBy({
      by: ['type'],
      _count: { id: true },
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

    for (const item of statusGrouped) {
      statusCounts[item.status] = item._count.id;
    }

    const typeCounts: Record<string, number> = {};
    for (const item of typeGrouped) {
      typeCounts[item.type] = item._count.id;
    }

    const succeededCount = statusCounts[JobStatus.SUCCEEDED] || 0;
    const completedOrFailedCount =
      succeededCount +
      (statusCounts[JobStatus.FAILED] || 0) +
      (statusCounts[JobStatus.TIMED_OUT] || 0);

    const successRate =
      completedOrFailedCount > 0
        ? Number(((succeededCount / completedOrFailedCount) * 100).toFixed(1))
        : 100.0;

    return {
      totalJobs: totalCount,
      successRate,
      byStatus: statusCounts,
      byType: typeCounts,
    };
  }

  async getTelemetry() {
    const cpuDef = await this.prisma.metricDefinition.findFirst({
      where: { metricName: 'CPUUtilization' },
    });

    const netInDef = await this.prisma.metricDefinition.findFirst({
      where: { metricName: 'NetworkIn' },
    });

    const netOutDef = await this.prisma.metricDefinition.findFirst({
      where: { metricName: 'NetworkOut' },
    });

    let cpuPoints: number[] = [];
    let netInVal: number | null = null;
    let netOutVal: number | null = null;

    if (cpuDef) {
      const recentCpuPoints = await this.prisma.metricPoint.findMany({
        where: { metricDefinitionId: cpuDef.id },
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: { value: true },
      });
      if (recentCpuPoints.length > 0) {
        cpuPoints = recentCpuPoints.map((p) => Number(p.value.toFixed(1))).reverse();
      }
    }

    if (netInDef) {
      const point = await this.prisma.metricPoint.findFirst({
        where: { metricDefinitionId: netInDef.id },
        orderBy: { timestamp: 'desc' },
        select: { value: true },
      });
      if (point) netInVal = point.value;
    }

    if (netOutDef) {
      const point = await this.prisma.metricPoint.findFirst({
        where: { metricDefinitionId: netOutDef.id },
        orderBy: { timestamp: 'desc' },
        select: { value: true },
      });
      if (point) netOutVal = point.value;
    }

    const currentCpu =
      cpuPoints.length > 0
        ? Number((cpuPoints.reduce((a, b) => a + b, 0) / cpuPoints.length).toFixed(1))
        : null;

    const netInMb = netInVal !== null ? (netInVal / (1024 * 1024)).toFixed(0) : null;
    const netOutMb = netOutVal !== null ? (netOutVal / (1024 * 1024)).toFixed(0) : null;

    return {
      cpu: {
        available: cpuPoints.length > 0,
        current: currentCpu,
        history: cpuPoints,
      },
      network: {
        available: netInVal !== null,
        inBytes: netInVal,
        outBytes: netOutVal,
        formatted:
          netInVal !== null
            ? `↓ ${netInMb} MB  ↑ ${netOutMb} MB`
            : 'N/A (no metric data collected yet)',
      },
      memory: {
        available: false,
        reason: 'CLOUDWATCH_AGENT_REQUIRED',
        formatted: 'N/A (CloudWatch Agent required)',
      },
    };
  }
}
