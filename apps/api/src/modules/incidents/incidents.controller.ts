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
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { AddRootCauseDto } from './dto/add-root-cause.dto';
import { AddResolutionNoteDto } from './dto/add-resolution-note.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import { AddTimelineDto } from './dto/add-timeline.dto';
import { AddEvidenceDto } from './dto/add-evidence.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  private getRequestId(req: Request): string | undefined {
    return (req as Request & { id?: string }).id || (req.headers['x-request-id'] as string | undefined);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async create(
    @Body() dto: CreateIncidentDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.incidentsService.create(dto, user, this.getRequestId(req));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('primaryResourceId') primaryResourceId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('search') search?: string,
  ) {
    return this.incidentsService.findAll(
      { primaryResourceId, assigneeId, status, severity, search },
      page,
      limit,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.findOne(id);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentStatusDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.incidentsService.updateStatus(id, dto, user, this.getRequestId(req));
  }

  @Post(':id/timeline')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async addTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTimelineDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.incidentsService.addTimeline(id, dto, user, this.getRequestId(req));
  }

  @Post(':id/evidence')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async addEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddEvidenceDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.incidentsService.addEvidence(id, dto, user, this.getRequestId(req));
  }

  @Post(':id/root-cause')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  async addRootCause(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddRootCauseDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.incidentsService.addRootCause(id, dto.rootCause, user, this.getRequestId(req));
  }

  @Post(':id/resolution')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  async addResolutionNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddResolutionNoteDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.incidentsService.addResolutionNote(id, dto.resolutionNote, user, this.getRequestId(req));
  }
}
