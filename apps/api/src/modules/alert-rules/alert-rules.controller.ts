import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { AlertRulesService } from './alert-rules.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';
import { ListAlertRulesDto } from './dto/list-alert-rules.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('alert-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlertRulesController {
  constructor(private readonly alertRulesService: AlertRulesService) {}

  private getRequestId(req: Request): string | undefined {
    return (req as Request & { id?: string }).id || (req.headers['x-request-id'] as string | undefined);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async create(
    @Body() dto: CreateAlertRuleDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.alertRulesService.create(dto, user, this.getRequestId(req));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('cloudAccountId') cloudAccountId?: string,
    @Query('resourceId') resourceId?: string,
    @Query('resourceType') resourceType?: string,
    @Query('severity') severity?: string,
    @Query('search') search?: string,
  ) {
    const filters: ListAlertRulesDto = {};
    if (cloudAccountId) filters.cloudAccountId = cloudAccountId;
    if (resourceId) filters.resourceId = resourceId;
    if (resourceType) filters.resourceType = resourceType;
    if (severity) filters.severity = severity as any;
    if (search) filters.search = search;

    return this.alertRulesService.findAll(filters, page, limit);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertRulesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertRuleDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.alertRulesService.update(id, dto, user, this.getRequestId(req));
  }

  @Post(':id/enable')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  async enable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.alertRulesService.enable(id, user, this.getRequestId(req));
  }

  @Post(':id/disable')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  async disable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.alertRulesService.disable(id, user, this.getRequestId(req));
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    await this.alertRulesService.softDelete(id, user, this.getRequestId(req));
  }
}
