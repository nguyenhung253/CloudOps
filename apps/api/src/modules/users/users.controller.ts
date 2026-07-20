import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Ip,
  Headers,
  ParseIntPipe,
  DefaultValuePipe,
  Req,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private getRequestId(req: Request): string | undefined {
    return (req as Request & { id?: string }).id || (req.headers['x-request-id'] as string | undefined);
  }

  @Get('me')
  async getMe(@CurrentUser() user: User) {
    return this.usersService.toPublicUser(user);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async listUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll({ page, limit, role, status, search });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  async getUserById(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.getByIdOrThrow(id);
    return this.usersService.toPublicUser(user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  async updateUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: User,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: Request,
  ) {
    return this.usersService.updateStatus(id, dto.status, actor, {
      ipAddress: ip,
      userAgent: userAgent || '',
      requestId: this.getRequestId(req),
    });
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  async updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: User,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: Request,
  ) {
    return this.usersService.updateRole(id, dto.role, actor, {
      ipAddress: ip,
      userAgent: userAgent || '',
      requestId: this.getRequestId(req),
    });
  }
}
