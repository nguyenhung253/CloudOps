import { BadRequestException, Injectable } from '@nestjs/common';
import { JobType, ResourceSyncStatus } from '@prisma/client';
import { ResourcesService } from '@api/resources/resources.service';
import type {
  JobHandler,
  JobHandlerContext,
  JobHandlerResult,
} from './job-handler.interface';

@Injectable()
export class ResourceSyncHandler implements JobHandler {
  readonly type = JobType.RESOURCE_SYNC;

  constructor(private readonly resourcesService: ResourcesService) {}

  async handle(ctx: JobHandlerContext): Promise<JobHandlerResult> {
    const { job, updateProgress, isCancelled } = ctx;
    const payload = (job.payload ?? {}) as {
      cloudAccountId?: string;
      regions?: string[];
      resourceTypes?: string[];
    };

    const cloudAccountId = job.cloudAccountId ?? payload.cloudAccountId;
    if (!cloudAccountId) {
      throw new BadRequestException('RESOURCE_SYNC job missing cloudAccountId');
    }

    if (await isCancelled()) {
      throw new BadRequestException('Job was cancelled before execution');
    }

    if (!job.requestedBy) {
      throw new BadRequestException('RESOURCE_SYNC job missing requestedBy');
    }

    const result = await this.resourcesService.syncAccountResources(
      cloudAccountId,
      {
        regions: payload.regions,
        resourceTypes: payload.resourceTypes,
      },
      { id: job.requestedBy },
      {
        onProgress: async (progress, message) => {
          if (await isCancelled()) {
            throw new BadRequestException('Job was cancelled during execution');
          }
          await updateProgress(progress, message);
        },
      },
    );

    if (result.status === ResourceSyncStatus.FAILED) {
      const err = new Error(result.errorMessage ?? 'Resource sync failed');
      (err as Error & { code?: string }).code =
        result.errorCode ?? 'RESOURCE_SYNC_FAILED';
      throw err;
    }

    return {
      summary: {
        snapshotId: result.snapshotId,
        status: result.status,
        regions: result.regions,
        resourceTypes: result.resourceTypes,
        discoveredCount: result.discoveredCount,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        inactivatedCount: result.inactivatedCount,
        durationMs: result.durationMs,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
      },
    };
  }
}
