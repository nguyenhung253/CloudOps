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
import { CloudAccountStatus, CloudProvider, UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { CloudAccountsService } from './cloud-accounts.service';
import { CreateCloudAccountDto } from './dto/create-cloud-account.dto';
import { UpdateCloudAccountDto } from './dto/update-cloud-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('cloud-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CloudAccountsController {
  constructor(private readonly cloudAccountsService: CloudAccountsService) {}

  private getRequestId(req: Request): string | undefined {
    return (req as Request & { id?: string }).id || (req.headers['x-request-id'] as string | undefined);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async create(
    @Body() dto: CreateCloudAccountDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.cloudAccountsService.create(dto, user, this.getRequestId(req));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: CloudAccountStatus,
    @Query('provider') provider?: CloudProvider,
    @Query('search') search?: string,
  ) {
    return this.cloudAccountsService.findAll({ page, limit, status, provider, search });
  }

  @Get('backend-info')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getBackendInfo() {
    return this.cloudAccountsService.getBackendInfo();
  }

  @Get(':id/resource-summary')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getResourceSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.cloudAccountsService.getResourceSummary(id, req.user);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.cloudAccountsService.getById(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCloudAccountDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.cloudAccountsService.update(id, dto, user, this.getRequestId(req));
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    await this.cloudAccountsService.softDelete(id, user, this.getRequestId(req));
  }

  @Post(':id/test-connection')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  async testConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.cloudAccountsService.testConnection(id, user, this.getRequestId(req));
  }

  @Get(':id/connection-history')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async connectionHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.cloudAccountsService.connectionHistory(id, { page, limit });
  }
}
