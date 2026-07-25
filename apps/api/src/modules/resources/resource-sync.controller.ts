import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import { SyncResourcesDto } from './dto/sync-resources.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JobsService } from '../jobs/jobs.service';

@Controller('cloud-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResourceSyncController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * POST /api/v1/cloud-accounts/:id/resources/sync
   * Async inventory sync: create Job → enqueue BullMQ → 202 + jobId.
   * Actual AWS work runs in the worker (RESOURCE_SYNC handler).
   */
  @Post(':id/resources/sync')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.ACCEPTED)
  async sync(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SyncResourcesDto,
    @CurrentUser() user: User,
  ) {
    const result = await this.jobsService.enqueueResourceSync({
      cloudAccountId: id,
      payload: {
        cloudAccountId: id,
        regions: dto?.regions,
        resourceTypes: dto?.resourceTypes,
      },
      actor: user,
    });

    return {
      jobId: result.job.id,
      job: result.job,
      accepted: true,
    };
  }
}
