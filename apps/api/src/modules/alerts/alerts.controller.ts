import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { AlertsService } from './alerts.service';
import { CreateIncidentFromAlertDto } from './dto/create-incident-from-alert.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  private getRequestId(req: Request): string | undefined {
    return (req as Request & { id?: string }).id || (req.headers['x-request-id'] as string | undefined);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('alertRuleId') alertRuleId?: string,
    @Query('resourceId') resourceId?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('search') search?: string,
  ) {
    return this.alertsService.findAll(
      { alertRuleId, resourceId, status: status as any, severity: severity as any, search },
      page,
      limit,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertsService.findOne(id);
  }

  @Post(':id/acknowledge')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  async acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.alertsService.acknowledge(id, user, this.getRequestId(req));
  }

  @Post(':id/resolve')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.alertsService.resolve(id, user, this.getRequestId(req));
  }

  @Post(':id/incidents')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.CREATED)
  async createIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateIncidentFromAlertDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.alertsService.createIncidentFromAlert(id, dto, user, this.getRequestId(req));
  }
}
