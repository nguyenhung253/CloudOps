import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';


import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/database';
import {
  AwsEc2Adapter,
  AwsElbv2Adapter,
  AwsStsAdapter,
  CloudResourceSnapshot,
  RESOURCE_TYPES,
  SYNC_SUPPORTED_RESOURCE_TYPES,
} from '@app/cloud-provider';
import {
  CloudAccountStatus,
  CloudProvider,
  CloudResource,
  JobType,
  Prisma,
  ResourceSyncStatus,
  User,
} from '@prisma/client';

import { decryptExternalId } from '../cloud-accounts/crypto/external-id.crypto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { JobsService } from '../jobs/jobs.service';

import { ListResourcesDto } from './dto/list-resources.dto';
import { ResourceSummaryQueryDto } from './dto/resource-summary-query.dto';
import { SyncResourcesDto } from './dto/sync-resources.dto';

const SUPPORTED_SYNC_TYPES = new Set<string>(SYNC_SUPPORTED_RESOURCE_TYPES);

export interface PublicCloudResource {
  id: string;
  cloudAccountId: string;
  provider: CloudProvider;
  region: string;
  resourceType: string;
  providerResourceId: string;
  name: string | null;
  status: string | null;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  isActive: boolean;
  firstDiscoveredAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegionSyncResult {
  region: string;
  resourceType: string;
  discovered: number;
  created: number;
  updated: number;
  inactivated: number;
  error?: string;
}

export interface SyncResourcesResult {
  snapshotId: string;
  cloudAccountId: string;
  status: ResourceSyncStatus;
  resourceTypes: string[];
  regions: string[];
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  discoveredCount: number;
  createdCount: number;
  updatedCount: number;
  inactivatedCount: number;
  regionResults: RegionSyncResult[];
  errorCode?: string | null;
  errorMessage?: string | null;
}

@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly awsStsAdapter: AwsStsAdapter,
    private readonly awsEc2Adapter: AwsEc2Adapter,
    private readonly awsElbv2Adapter: AwsElbv2Adapter,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
    @Optional()
    @Inject(forwardRef(() => JobsService))
    private readonly jobsService?: JobsService,
  ) {}



  private encryptionSecret(): string {
    return (
      this.configService.get<string>('EXTERNAL_ID_ENCRYPTION_KEY') ||
      this.configService.get<string>('auth.jwtSecret') ||
      process.env.JWT_SECRET ||
      'dev-external-id-secret'
    );
  }

  toPublic(resource: CloudResource): PublicCloudResource {
    return {
      id: resource.id,
      cloudAccountId: resource.cloudAccountId,
      provider: resource.provider,
      region: resource.region,
      resourceType: resource.resourceType,
      providerResourceId: resource.providerResourceId,
      name: resource.name,
      status: resource.status,
      tags: (resource.tags as Record<string, string>) ?? {},
      metadata: (resource.metadata as Record<string, unknown>) ?? {},
      isActive: resource.isActive,
      firstDiscoveredAt: resource.firstDiscoveredAt,
      lastSeenAt: resource.lastSeenAt,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    };
  }

  async findAll(query: ListResourcesDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where = this.buildListWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cloudResource.findMany({
        where,
        orderBy: [{ lastSeenAt: 'desc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.cloudResource.count({ where }),
    ]);

    return {
      data: items.map((item) => this.toPublic(item)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string): Promise<PublicCloudResource> {
    const resource = await this.prisma.cloudResource.findUnique({
      where: { id },
    });
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }
    return this.toPublic(resource);
  }

  async getSummary(query: ResourceSummaryQueryDto) {
    const where: Prisma.CloudResourceWhereInput = {};

    if (query.accountId) {
      where.cloudAccountId = query.accountId;
    }
    if (query.region) {
      where.region = query.region;
    }
    if (query.resourceType) {
      where.resourceType = query.resourceType;
    }

    const [total, active, inactive, byTypeRows, byStatusRows, byRegionRows] =
      await Promise.all([
        this.prisma.cloudResource.count({ where }),
        this.prisma.cloudResource.count({ where: { ...where, isActive: true } }),
        this.prisma.cloudResource.count({ where: { ...where, isActive: false } }),
        this.prisma.cloudResource.groupBy({
          by: ['resourceType'],
          where,
          _count: { _all: true },
        }),
        this.prisma.cloudResource.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        this.prisma.cloudResource.groupBy({
          by: ['region'],
          where,
          _count: { _all: true },
        }),
      ]);

    const byType: Record<string, number> = {};
    for (const row of byTypeRows) {
      byType[row.resourceType] = row._count._all;
    }

    const byStatus: Record<string, number> = {};
    for (const row of byStatusRows) {
      byStatus[row.status ?? 'unknown'] = row._count._all;
    }

    const byRegion: Record<string, number> = {};
    for (const row of byRegionRows) {
      byRegion[row.region] = row._count._all;
    }

    return {
      total,
      active,
      inactive,
      byType,
      byStatus,
      byRegion,
      filters: {
        accountId: query.accountId ?? null,
        region: query.region ?? null,
        resourceType: query.resourceType ?? null,
      },
    };
  }

  /**
   * Execute inventory sync (runs in worker via RESOURCE_SYNC job).
   * Loads credentials, discovers resources via AWS adapters, upserts to PostgreSQL.
   */
  async syncAccountResources(
    cloudAccountId: string,
    dto: SyncResourcesDto,
    actor: Pick<User, 'id'>,
    options?: {
      requestId?: string;
      onProgress?: (progress: number, message: string) => Promise<void>;
      abortSignal?: AbortSignal;
    },
  ): Promise<SyncResourcesResult> {
    const requestId = options?.requestId;
    const onProgress = options?.onProgress;
    const abortSignal = options?.abortSignal;

    const account = await this.prisma.cloudAccount.findFirst({
      where: { id: cloudAccountId, deletedAt: null },
      include: { regions: true },
    });

    if (!account) {
      throw new NotFoundException('Cloud account not found');
    }

    if (account.provider !== CloudProvider.AWS) {
      throw new BadRequestException('Resource sync is only supported for AWS accounts');
    }

    if (account.status === CloudAccountStatus.DISABLED) {
      throw new BadRequestException('Cannot sync resources for a disabled cloud account');
    }

    if (!account.roleArn) {
      throw new BadRequestException('Cloud account is missing IAM role ARN');
    }

    const resourceTypes = this.resolveResourceTypes(dto.resourceTypes);
    const regions = this.resolveRegions(account.regions, dto.regions);

    await onProgress?.(5, 'Creating sync snapshot');

    // Sync mutex: prevent concurrent syncs on the same cloud account.
    // If a RUNNING snapshot exists and is NOT orphaned (< 2 hours old),
    // reject the new sync to avoid data corruption from overlapping upserts.
    const activeSync = await this.prisma.resourceSyncSnapshot.findFirst({
      where: {
        cloudAccountId: account.id,
        status: ResourceSyncStatus.RUNNING,
        startedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      },
      select: { id: true, startedAt: true },
    });
    if (activeSync) {
      throw new BadRequestException(
        `A resource sync is already running for this account (started at ${activeSync.startedAt.toISOString()}). ` +
        'Wait for it to complete or cancel the existing sync job.',
      );
    }

    // Clean up any orphaned RUNNING snapshots from a previous worker crash.
    // A snapshot stuck in RUNNING for >2 hours means the worker died mid-sync.
    const orphanCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const orphaned = await this.prisma.resourceSyncSnapshot.updateMany({
      where: {
        cloudAccountId: account.id,
        status: ResourceSyncStatus.RUNNING,
        startedAt: { lt: orphanCutoff },
      },
      data: {
        status: ResourceSyncStatus.FAILED,
        finishedAt: new Date(),
        errorCode: 'WORKER_LOST',
        errorMessage: 'Worker process lost before sync could complete',
      },
    });
    if (orphaned.count > 0) {
      this.logger.warn(
        `Cleaned up ${orphaned.count} orphaned RUNNING snapshot(s) for account ${account.id}`,
      );
    }

    const startedAt = new Date();
    const snapshot = await this.prisma.resourceSyncSnapshot.create({
      data: {
        cloudAccountId: account.id,
        provider: account.provider,
        status: ResourceSyncStatus.RUNNING,
        resourceTypes,
        regions,
        startedAt,
        requestedBy: actor.id,
        summary: {},
      },
    });

    let credentials;
    try {
      await onProgress?.(10, 'Assuming IAM role');
      const externalId = account.externalIdCiphertext
        ? decryptExternalId(account.externalIdCiphertext, this.encryptionSecret())
        : undefined;

      credentials = await this.awsStsAdapter.assumeRole({
        roleArn: account.roleArn,
        externalId,
        roleSessionName: `cloudops-sync-${account.id.slice(0, 8)}`,
      });
    } catch (error: any) {
      const message = error?.message ?? 'Failed to assume IAM role';
      const code = error?.code ?? error?.name ?? 'ASSUME_ROLE_FAILED';

      // Classify whether this is a transient or permanent IAM failure
      const isTransient =
        code === 'ThrottlingException' ||
        code === 'Throttling' ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ServiceUnavailableException' ||
        code === 'ServiceUnavailable' ||
        code === 'RequestLimitExceeded' ||
        (error?.statusCode && (error.statusCode === 429 || error.statusCode === 503 || error.statusCode === 504));

      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      await this.prisma.resourceSyncSnapshot.update({
        where: { id: snapshot.id },
        data: {
          status: isTransient ? ResourceSyncStatus.RUNNING : ResourceSyncStatus.FAILED,
          finishedAt: isTransient ? null : finishedAt,
          durationMs: isTransient ? null : durationMs,
          errorCode: code,
          errorMessage: message,
        },
      });

      if (isTransient) {
        // Re-throw so worker's classifyJobError picks up the retryable code.
        // Snapshot stays RUNNING — worker retries with backoff.
        const transientError = new Error(message);
        (transientError as any).code = code;
        (transientError as any).name = 'TransientAssumeRoleError';
        throw transientError;
      }

      const failed = await this.prisma.resourceSyncSnapshot.findUniqueOrThrow({
        where: { id: snapshot.id },
      });

      return {
        snapshotId: failed.id,
        cloudAccountId: account.id,
        status: failed.status,
        resourceTypes,
        regions,
        startedAt: failed.startedAt,
        finishedAt: failed.finishedAt,
        durationMs: failed.durationMs,
        discoveredCount: 0,
        createdCount: 0,
        updatedCount: 0,
        inactivatedCount: 0,
        regionResults: [],
        errorCode: failed.errorCode,
        errorMessage: failed.errorMessage,
      };
    }

    const regionResults: RegionSyncResult[] = [];
    let discoveredCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let inactivatedCount = 0;
    let regionFailures = 0;

    const totalSteps = Math.max(1, regions.length * resourceTypes.length);
    let step = 0;

    for (const region of regions) {
      if (abortSignal?.aborted) {
        throw new BadRequestException('Sync aborted: job was cancelled or timed out');
      }
      for (const resourceType of resourceTypes) {
        step += 1;
        const progress = Math.min(
          90,
          15 + Math.floor((step / totalSteps) * 75),
        );
        await onProgress?.(
          progress,
          `Syncing ${resourceType} in ${region} (${step}/${totalSteps})`,
        );

        try {
          const result = await this.syncRegionResourceType({
            cloudAccountId: account.id,
            region,
            resourceType,
            credentials,
          });
          regionResults.push(result);
          discoveredCount += result.discovered;
          createdCount += result.created;
          updatedCount += result.updated;
          inactivatedCount += result.inactivated;

          await this.prisma.cloudAccountRegion.updateMany({
            where: { cloudAccountId: account.id, region },
            data: { lastSyncedAt: new Date() },
          });
        } catch (error: any) {
          regionFailures += 1;
          const message = error?.message ?? 'Region sync failed';
          this.logger.warn(
            `Sync failed account=${account.id} region=${region} type=${resourceType}: ${message}`,
          );
          regionResults.push({
            region,
            resourceType,
            discovered: 0,
            created: 0,
            updated: 0,
            inactivated: 0,
            error: message,
          });
        }
      }
    }

    const finishedAt = new Date();
    let status: ResourceSyncStatus = ResourceSyncStatus.SUCCEEDED;
    if (regionFailures > 0 && regionFailures === regionResults.length) {
      status = ResourceSyncStatus.FAILED;
    } else if (regionFailures > 0) {
      status = ResourceSyncStatus.PARTIAL;
    }

    await onProgress?.(95, 'Finalizing sync snapshot');

    const updatedSnapshot = await this.prisma.resourceSyncSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        discoveredCount,
        createdCount,
        updatedCount,
        inactivatedCount,
        errorCode:
          status === ResourceSyncStatus.FAILED
            ? 'REGION_SYNC_FAILED'
            : status === ResourceSyncStatus.PARTIAL
              ? 'PARTIAL_REGION_FAILURE'
              : null,
        errorMessage:
          regionFailures > 0
            ? `${regionFailures} region/type sync operation(s) failed`
            : null,
        summary: {
          regionResults,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'RESOURCE_SYNC_COMPLETED',
      targetType: 'cloud_account',
      targetId: account.id,
      requestId,
      metadata: {
        snapshotId: updatedSnapshot.id,
        status,
        resourceTypes,
        regions,
        discoveredCount,
        createdCount,
        updatedCount,
        inactivatedCount,
      },
    });

    await onProgress?.(100, 'Resource sync completed');

    return {
      snapshotId: updatedSnapshot.id,
      cloudAccountId: account.id,
      status: updatedSnapshot.status,
      resourceTypes,
      regions,
      startedAt: updatedSnapshot.startedAt,
      finishedAt: updatedSnapshot.finishedAt,
      durationMs: updatedSnapshot.durationMs,
      discoveredCount,
      createdCount,
      updatedCount,
      inactivatedCount,
      regionResults,
      errorCode: updatedSnapshot.errorCode,
      errorMessage: updatedSnapshot.errorMessage,
    };
  }

  private resolveResourceTypes(requested?: string[]): string[] {
    const types =
      requested && requested.length > 0
        ? [...new Set(requested.map((t) => t.trim()).filter(Boolean))]
        : [...SYNC_SUPPORTED_RESOURCE_TYPES];

    const unsupported = types.filter((t) => !SUPPORTED_SYNC_TYPES.has(t));
    if (unsupported.length > 0) {
      throw new BadRequestException(
        `Unsupported resource type(s) for sync: ${unsupported.join(', ')}. Supported: ${[...SUPPORTED_SYNC_TYPES].join(', ')}`,
      );
    }

    return types;
  }

  private resolveRegions(
    accountRegions: Array<{ region: string; isEnabled: boolean }>,
    requested?: string[],
  ): string[] {
    const enabled = accountRegions.filter((r) => r.isEnabled).map((r) => r.region);

    if (enabled.length === 0) {
      throw new BadRequestException('Cloud account has no enabled regions to sync');
    }

    if (!requested || requested.length === 0) {
      return enabled;
    }

    const unique = [...new Set(requested.map((r) => r.trim()).filter(Boolean))];
    const invalid = unique.filter((r) => !enabled.includes(r));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Region(s) not enabled on this account: ${invalid.join(', ')}`,
      );
    }

    return unique;
  }

  private async syncRegionResourceType(params: {
    cloudAccountId: string;
    region: string;
    resourceType: string;
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
    };
  }): Promise<RegionSyncResult> {
    const { cloudAccountId, region, resourceType, credentials } = params;

    const snapshots = await this.fetchSnapshotsForType({
      resourceType,
      credentials,
      region,
      cloudAccountId,
    });

    const upsertResult = await this.upsertSnapshots(snapshots, {
      cloudAccountId,
      region,
      resourceType,
    });

    return {
      region,
      resourceType,
      discovered: snapshots.length,
      created: upsertResult.created,
      updated: upsertResult.updated,
      inactivated: upsertResult.inactivated,
    };
  }

  private async fetchSnapshotsForType(params: {
    resourceType: string;
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
    };
    region: string;
    cloudAccountId: string;
  }): Promise<CloudResourceSnapshot[]> {
    const { resourceType, credentials, region, cloudAccountId } = params;

    switch (resourceType) {
      case RESOURCE_TYPES.EC2_INSTANCE:
        return this.awsEc2Adapter.describeInstances(credentials, region, cloudAccountId);
      case RESOURCE_TYPES.EBS_VOLUME:
        return this.awsEc2Adapter.describeVolumes(credentials, region, cloudAccountId);
      case RESOURCE_TYPES.SECURITY_GROUP:
        return this.awsEc2Adapter.describeSecurityGroups(credentials, region, cloudAccountId);
      case RESOURCE_TYPES.APPLICATION_LOAD_BALANCER:
        return this.awsElbv2Adapter.describeApplicationLoadBalancers(
          credentials,
          region,
          cloudAccountId,
        );
      default:
        throw new BadRequestException(`Resource type ${resourceType} is not implemented yet`);
    }
  }

  /**
   * Upsert normalized snapshots and mark resources missing from this sync as inactive.
   */
  private async upsertSnapshots(
    snapshots: CloudResourceSnapshot[],
    scope: { cloudAccountId: string; region: string; resourceType: string },
  ): Promise<{ created: number; updated: number; inactivated: number }> {
    const now = new Date();
    const seenIds = snapshots.map((s) => s.providerResourceId);

    const existing = await this.prisma.cloudResource.findMany({
      where: {
        provider: CloudProvider.AWS,
        cloudAccountId: scope.cloudAccountId,
        region: scope.region,
        resourceType: scope.resourceType,
        providerResourceId: { in: seenIds.length > 0 ? seenIds : ['__none__'] },
      },
      select: { id: true, providerResourceId: true },
    });
    const existingByProviderId = new Map(
      existing.map((row) => [row.providerResourceId, row.id]),
    );

    let created = 0;
    let updated = 0;

    for (const snapshot of snapshots) {
      const tagsJson = snapshot.tags as Prisma.InputJsonValue;
      const metadataJson = snapshot.metadata as Prisma.InputJsonValue;
      const existingId = existingByProviderId.get(snapshot.providerResourceId);

      if (existingId) {
        await this.prisma.cloudResource.update({
          where: { id: existingId },
          data: {
            name: snapshot.name ?? null,
            status: snapshot.status ?? null,
            tags: tagsJson,
            metadata: metadataJson,
            isActive: true,
            lastSeenAt: now,
          },
        });
        await this.replaceResourceTags(existingId, snapshot.tags);
        updated += 1;
      } else {
        const createdResource = await this.prisma.cloudResource.create({
          data: {
            cloudAccountId: scope.cloudAccountId,
            provider: CloudProvider.AWS,
            region: scope.region,
            resourceType: scope.resourceType,
            providerResourceId: snapshot.providerResourceId,
            name: snapshot.name ?? null,
            status: snapshot.status ?? null,
            tags: tagsJson,
            metadata: metadataJson,
            isActive: true,
            firstDiscoveredAt: now,
            lastSeenAt: now,
          },
        });
        await this.replaceResourceTags(createdResource.id, snapshot.tags);
        created += 1;
      }
    }

    // Resources previously active in this scope but not returned by AWS → inactive
    const inactivated = await this.prisma.cloudResource.updateMany({
      where: {
        provider: CloudProvider.AWS,
        cloudAccountId: scope.cloudAccountId,
        region: scope.region,
        resourceType: scope.resourceType,
        isActive: true,
        ...(seenIds.length > 0
          ? { providerResourceId: { notIn: seenIds } }
          : {}),
      },
      data: {
        isActive: false,
      },
    });

    return {
      created,
      updated,
      inactivated: inactivated.count,
    };
  }

  private async replaceResourceTags(
    resourceId: string,
    tags: Record<string, string>,
  ): Promise<void> {
    await this.prisma.resourceTag.deleteMany({ where: { resourceId } });

    const entries = Object.entries(tags);
    if (entries.length === 0) {
      return;
    }

    await this.prisma.resourceTag.createMany({
      data: entries.map(([key, value]) => ({
        resourceId,
        key: key.slice(0, 128),
        value: String(value).slice(0, 256),
      })),
      skipDuplicates: true,
    });
  }

  private buildListWhere(query: ListResourcesDto): Prisma.CloudResourceWhereInput {
    const where: Prisma.CloudResourceWhereInput = {};

    if (query.accountId) {
      where.cloudAccountId = query.accountId;
    }
    if (query.region) {
      where.region = query.region;
    }
    if (query.resourceType) {
      where.resourceType = query.resourceType;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { providerResourceId: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  async collectMetrics(id: string, actor: User) {
    const resource = await this.prisma.cloudResource.findUnique({
      where: { id },
    });
    if (!resource) {
      throw new NotFoundException(`Resource ${id} not found`);
    }
    if (!this.jobsService) {
      throw new BadRequestException('JobsService is not available in current context');
    }

    const result = await this.jobsService.createAndEnqueue(

      {
        type: JobType.METRIC_COLLECTION,
        cloudAccountId: resource.cloudAccountId,
        resourceId: resource.id,
        payload: {
          resourceId: resource.id,
          cloudAccountId: resource.cloudAccountId,
        },
      },
      actor,
    );

    return {
      jobId: result.job.id,
      status: 'QUEUED',
      accepted: true,
    };

  }

  async getResourceHealth(id: string) {
    const resource = await this.prisma.cloudResource.findUnique({
      where: { id },
    });
    if (!resource) {
      throw new NotFoundException(`Resource ${id} not found`);
    }

    const snapshots = await this.prisma.resourceHealthSnapshot.findMany({
      where: { resourceId: id },
      orderBy: { evaluatedAt: 'desc' },
      take: 20,
    });

    const latest = snapshots[0] ?? null;

    return {
      resourceId: resource.id,
      name: resource.name,
      providerResourceId: resource.providerResourceId,
      currentStatus: latest?.status ?? 'UNKNOWN',
      currentHealth: latest ?? {
        status: 'UNKNOWN',
        reason: 'No metric or health evaluation recorded yet',
        evaluatedAt: resource.updatedAt,
      },
      history: snapshots,
    };
  }
}

