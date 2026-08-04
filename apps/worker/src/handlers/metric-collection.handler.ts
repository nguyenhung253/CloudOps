import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/database';
import {
  AwsCloudWatchAdapter,
  AwsStsAdapter,
  MVP_EC2_METRIC_NAMES,
} from '@app/cloud-provider';
import {
  CloudProvider,
  HealthStatus,
  JobType,
  Prisma,
} from '@prisma/client';
import { decryptExternalId } from '@api/cloud-accounts/crypto/external-id.crypto';
import { ResourceHealthEvaluator } from '../evaluators/resource-health.evaluator';
import { AutoIncidentService } from '../services/auto-incident.service';
import type {
  JobHandler,
  JobHandlerContext,
  JobHandlerResult,
} from './job-handler.interface';

@Injectable()
export class MetricCollectionHandler implements JobHandler {
  readonly type = JobType.METRIC_COLLECTION;
  private readonly logger = new Logger(MetricCollectionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly awsStsAdapter: AwsStsAdapter,
    private readonly awsCloudWatchAdapter: AwsCloudWatchAdapter,
    private readonly configService: ConfigService,
    private readonly healthEvaluator: ResourceHealthEvaluator,
    private readonly autoIncidentService: AutoIncidentService,
  ) {}

  private encryptionSecret(): string {
    return (
      this.configService.get<string>('EXTERNAL_ID_ENCRYPTION_KEY') ||
      this.configService.get<string>('JWT_SECRET') ||
      process.env.JWT_SECRET ||
      'dev-external-id-secret'
    );
  }

  async handle(ctx: JobHandlerContext): Promise<JobHandlerResult> {
    const { job, updateProgress, isCancelled, abortSignal } = ctx;
    const payload = (job.payload ?? {}) as {
      resourceId?: string;
      cloudAccountId?: string;
    };
    const targetResourceId = job.resourceId ?? payload.resourceId;
    const targetAccountId = job.cloudAccountId ?? payload.cloudAccountId;

    await updateProgress(10, 'Ensuring metric definitions in database');
    const metricDefMap = await this.ensureMetricDefinitions();

    const targetResources: Array<
      Prisma.CloudResourceGetPayload<{ include: { cloudAccount: true } }>
    > = [];

    if (targetResourceId) {
      const res = await this.prisma.cloudResource.findUnique({
        where: { id: targetResourceId },
        include: { cloudAccount: true },
      });
      if (!res) throw new NotFoundException(`Resource ${targetResourceId} not found`);
      targetResources.push(res);
    } else if (targetAccountId) {
      const list = await this.prisma.cloudResource.findMany({
        where: {
          cloudAccountId: targetAccountId,
          resourceType: { in: ['EC2_INSTANCE', 'ec2:instance', 'AWS::EC2::Instance', 'ec2'] },
          isActive: true,
        },
        include: { cloudAccount: true },
      });
      targetResources.push(...list);
    } else {
      const list = await this.prisma.cloudResource.findMany({
        where: {
          resourceType: { in: ['EC2_INSTANCE', 'ec2:instance', 'AWS::EC2::Instance', 'ec2'] },
          isActive: true,
        },
        include: { cloudAccount: true },
        take: 50,
      });
      targetResources.push(...list);
    }

    if (targetResources.length === 0) {
      this.logger.warn('No active EC2 resources found to collect metrics');
      return {
        summary: {
          success: true,
          collectedResourcesCount: 0,
          message: 'No active EC2 resources found',
        },
      };
    }

    await updateProgress(30, `Collecting CloudWatch metrics for ${targetResources.length} resources`);

    let totalPointsSaved = 0;
    const healthSummaries: Array<{
      resourceId: string;
      name: string | null;
      status: HealthStatus;
      reason: string;
    }> = [];

    const now = new Date();
    const startTime = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

    for (let i = 0; i < targetResources.length; i++) {
      if (await isCancelled()) {
        throw new BadRequestException('Job was cancelled during metric collection');
      }
      if (abortSignal.aborted) {
        throw new BadRequestException('Job was timed out during metric collection');
      }

      const resource = targetResources[i];
      const account = resource.cloudAccount;

      let credentials;
      if (account?.roleArn) {
        try {
          let externalId: string | undefined;
          if (account.externalIdCiphertext) {
            externalId = decryptExternalId(
              account.externalIdCiphertext,
              this.encryptionSecret(),
            );
          }
          const stsResult = await this.awsStsAdapter.assumeRole({
            roleArn: account.roleArn,
            externalId,
            roleSessionName: `cloudops-cw-${resource.id.slice(0, 8)}`,
          });
          if (stsResult?.accessKeyId) {
            credentials = stsResult;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Could not assume IAM role for account ${account?.id}: ${msg}`);
        }
      }

      const fetchedPoints = await this.awsCloudWatchAdapter.getEc2Metrics({
        credentials,
        region: resource.region || 'us-east-1',
        instanceId: resource.providerResourceId,
        startTime,
        endTime: now,
        periodSeconds: 300,
      });

      // Save MetricPoints — only catch duplicate constraint (P2002), re-throw real errors
      for (const point of fetchedPoints) {
        const def = metricDefMap[point.metricName];
        if (!def) continue;

        try {
          await this.prisma.metricPoint.upsert({
            where: {
              resourceId_metricDefinitionId_timestamp_dimensionsHash: {
                resourceId: resource.id,
                metricDefinitionId: def.id,
                timestamp: point.timestamp,
                dimensionsHash: 'default',
              },
            },
            create: {
              resourceId: resource.id,
              metricDefinitionId: def.id,
              timestamp: point.timestamp,
              value: point.value,
              unit: point.unit ?? def.unit,
              dimensionsHash: 'default',
            },
            update: {
              value: point.value,
            },
          });
          totalPointsSaved++;
        } catch (err: unknown) {
          if (
            err &&
            typeof err === 'object' &&
            'code' in err &&
            (err as { code: string }).code === 'P2002'
          ) {
            // Expected race condition: duplicate unique key from concurrent collection
            continue;
          }
          throw err;
        }
      }

      // Compute & Upsert 1-hour Aggregate
      for (const metricName of MVP_EC2_METRIC_NAMES) {
        const def = metricDefMap[metricName];
        if (!def) continue;

        const pointsForMetric = fetchedPoints.filter((p) => p.metricName === metricName);
        if (pointsForMetric.length === 0) continue;

        const values = pointsForMetric.map((p) => p.value);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const sumVal = values.reduce((a, b) => a + b, 0);
        const avgVal = sumVal / values.length;

        const bucketStart = new Date(
          Math.floor(startTime.getTime() / (3600 * 1000)) * 3600 * 1000,
        );

        try {
          await this.prisma.metricAggregate.upsert({
            where: {
              resourceId_metricDefinitionId_bucketStart_bucketSize: {
                resourceId: resource.id,
                metricDefinitionId: def.id,
                bucketStart,
                bucketSize: '1h',
              },
            },
            create: {
              resourceId: resource.id,
              metricDefinitionId: def.id,
              bucketStart,
              bucketSize: '1h',
              minValue: minVal,
              maxValue: maxVal,
              avgValue: avgVal,
              sumValue: sumVal,
              sampleCount: values.length,
            },
            update: {
              minValue: minVal,
              maxValue: maxVal,
              avgValue: avgVal,
              sumValue: sumVal,
              sampleCount: values.length,
            },
          });
        } catch (err: unknown) {
          if (
            err &&
            typeof err === 'object' &&
            'code' in err &&
            (err as { code: string }).code === 'P2002'
          ) {
            continue;
          }
          throw err;
        }
      }

      // Evaluate Resource Health with ResourceHealthEvaluator
      const evaluation = this.healthEvaluator.evaluate(fetchedPoints);

      // Save ResourceHealthSnapshot in a transaction — all-or-nothing
      await this.prisma.$transaction(async (tx) => {
        await tx.resourceHealthSnapshot.create({
          data: {
            resourceId: resource.id,
            status: evaluation.overallHealth,
            reason: evaluation.primaryReason,
            cpuUtilization: evaluation.cpuAverage !== null
              ? Number(evaluation.cpuAverage)
              : null,
            statusCheckFailed: evaluation.statusCheckFailedMax !== null
              ? Number(evaluation.statusCheckFailedMax)
              : null,
            metricsSummary: (evaluation.latestMetrics ?? {}) as Prisma.InputJsonValue,
            evaluatedAt: now,
          },
        });

        // Update resource status column for convenience — uses deduced health
        // CloudResource.status is separate from CloudResource.metadata/name and
        // is used by dashboard for quick filtering; AWS sync stores actual EC2
        // state in the metadata column
        await tx.cloudResource.update({
          where: { id: resource.id },
          data: { status: evaluation.overallHealth.toLowerCase() },
        });
      });

      // Auto Incident & Alert Dispatch if UNHEALTHY or DEGRADED
      if (
        evaluation.overallHealth === HealthStatus.UNHEALTHY ||
        evaluation.overallHealth === HealthStatus.DEGRADED
      ) {
        await this.autoIncidentService.dispatchForResource(resource, evaluation);
      }

      healthSummaries.push({
        resourceId: resource.id,
        name: resource.name,
        status: evaluation.overallHealth,
        reason: evaluation.primaryReason,
      });

      const pct = 30 + Math.round(((i + 1) / targetResources.length) * 60);
      await updateProgress(pct, `Processed ${i + 1}/${targetResources.length} resources`);
    }

    await updateProgress(100, 'Metric collection and health evaluation complete');

    return {
      summary: {
        success: true,
        resourcesEvaluated: targetResources.length,
        totalPointsSaved,
        healthSummaries,
      },
    };
  }

  private async ensureMetricDefinitions() {
    const map: Record<string, { id: string; metricName: string; unit?: string | null }> = {};

    for (const name of MVP_EC2_METRIC_NAMES) {
      const isAgent = name === 'mem_used_percent' || name === 'disk_used_percent';
      const namespace = isAgent ? 'CWAgent' : 'AWS/EC2';
      const unit =
        name.includes('Percent') || name.includes('percent') || name === 'CPUUtilization'
          ? 'Percent'
          : name.includes('Bytes')
            ? 'Bytes'
            : name.includes('Count') || name.includes('Failed')
              ? 'Count'
              : 'Bytes';

      const def = await this.prisma.metricDefinition.upsert({
        where: {
          provider_resourceType_namespace_metricName: {
            provider: CloudProvider.AWS,
            resourceType: 'ec2:instance',
            namespace,
            metricName: name,
          },
        },
        create: {
          provider: CloudProvider.AWS,
          resourceType: 'ec2:instance',
          namespace,
          metricName: name,
          defaultStatistic: name === 'StatusCheckFailed' ? 'Maximum' : 'Average',
          defaultPeriodSeconds: 300,
          unit,
          isEnabled: true,
        },
        update: {},
      });

      map[name] = { id: def.id, metricName: def.metricName, unit: def.unit };
    }

    return map;
  }
}
