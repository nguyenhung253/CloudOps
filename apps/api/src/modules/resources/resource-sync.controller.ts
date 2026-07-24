import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { ResourcesService } from './resources.service';
import { SyncResourcesDto } from './dto/sync-resources.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('cloud-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResourceSyncController {
  constructor(private readonly resourcesService: ResourcesService) {}

  private getRequestId(req: Request): string | undefined {
    return (
      (req as Request & { id?: string }).id ||
      (req.headers['x-request-id'] as string | undefined)
    );
  }

  /**
   * POST /api/v1/cloud-accounts/:id/resources/sync
   * Direct (synchronous) inventory sync — MVP: EC2 instances.
   */
  @Post(':id/resources/sync')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  async sync(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SyncResourcesDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.resourcesService.syncAccountResources(
      id,
      dto ?? {},
      user,
      this.getRequestId(req),
    );
  }
}
