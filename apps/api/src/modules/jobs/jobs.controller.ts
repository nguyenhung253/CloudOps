import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsDto } from './dto/list-jobs.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * POST /api/v1/jobs
   * Create Job in PostgreSQL, enqueue minimal { jobId } to BullMQ, return 202.
   */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.ACCEPTED)
  async create(@Body() dto: CreateJobDto, @CurrentUser() user: User) {
    const result = await this.jobsService.createAndEnqueue(dto, user);
    return {
      jobId: result.job.id,
      job: result.job,
      accepted: true,
    };
  }

  /**
   * GET /api/v1/jobs
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async list(@Query() query: ListJobsDto, @CurrentUser() user: User) {
    return this.jobsService.findAll(query, user);
  }

  /**
   * GET /api/v1/jobs/:id
   */
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.jobsService.findById(id, user);
  }

  /**
   * GET /api/v1/jobs/:id/executions
   */
  @Get(':id/executions')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async executions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.jobsService.listExecutions(id, user);
  }

  /**
   * GET /api/v1/jobs/:id/events
   */
  @Get(':id/events')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  async events(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.jobsService.listEvents(id, user);
  }

  /**
   * POST /api/v1/jobs/:id/cancel
   */
  @Post(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.jobsService.cancel(id, user);
  }

  /**
   * POST /api/v1/jobs/:id/requeue
   * Re-publish a PENDING job after Redis recovery.
   */
  @Post(':id/requeue')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @HttpCode(HttpStatus.ACCEPTED)
  async requeue(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const job = await this.jobsService.retryEnqueue(id, user);
    return { jobId: job.id, job, accepted: true };
  }
}
