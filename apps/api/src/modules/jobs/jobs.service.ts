import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import { QueueService, QUEUE_JOB_NAMES } from '@app/queue';
import {
  Job,
  JobStatus,
  JobType,
  Prisma,
  User,
  UserRole,
} from '@prisma/client';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsDto } from './dto/list-jobs.dto';

const MVP_TYPES = new Set<JobType>([JobType.RESOURCE_SYNC, JobType.HEALTH_CHECK]);

const TERMINAL_STATUSES = new Set<JobStatus>([
  JobStatus.SUCCEEDED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
  JobStatus.TIMED_OUT,
]);

const CANCELLABLE_STATUSES = new Set<JobStatus>([
  JobStatus.PENDING,
  JobStatus.QUEUED,
  JobStatus.RUNNING,
  JobStatus.RETRYING,
]);

export interface PublicJob {
  id: string;
  type: JobType;
  status: JobStatus;
  cloudAccountId: string | null;
  resourceId: string | null;
  requestedBy: string | null;
  payload: unknown;
  resultSummary: unknown;
  idempotencyKey: string | null;
  priority: number;
  progress: number;
  attemptsMade: number;
  maxAttempts: number;
  queuedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  enqueueError?: string | null;
}

export interface CreateJobResult {
  job: PublicJob;
  accepted: true;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  toPublic(job: Job, extra?: { enqueueError?: string | null }): PublicJob {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      cloudAccountId: job.cloudAccountId,
      resourceId: job.resourceId,
      requestedBy: job.requestedBy,
      payload: job.payload,
      resultSummary: job.resultSummary,
      idempotencyKey: job.idempotencyKey,
      priority: job.priority,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.maxAttempts,
      queuedAt: job.queuedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      cancelledAt: job.cancelledAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      enqueueError: extra?.enqueueError ?? null,
    };
  }

  /**
   * Create Job row in PostgreSQL first, then publish minimal { jobId } to Redis.
   * Redis failures never drop the Job record (status stays PENDING).
   */
  async createAndEnqueue(
    dto: CreateJobDto,
    actor: User,
  ): Promise<CreateJobResult> {
    this.assertMvpType(dto.type);

    if (dto.idempotencyKey) {
      const existing = await this.prisma.job.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return { job: this.toPublic(existing), accepted: true };
      }
    }

    const cloudAccountId =
      dto.cloudAccountId ??
      (typeof dto.payload?.cloudAccountId === 'string'
        ? dto.payload.cloudAccountId
        : undefined);

    if (
      (dto.type === JobType.RESOURCE_SYNC || dto.type === JobType.HEALTH_CHECK) &&
      !cloudAccountId
    ) {
      throw new BadRequestException(
        `${dto.type} requires cloudAccountId (body field or payload.cloudAccountId)`,
      );
    }

    if (cloudAccountId) {
      const account = await this.prisma.cloudAccount.findFirst({
        where: { id: cloudAccountId, deletedAt: null },
        select: { id: true },
      });
      if (!account) {
        throw new NotFoundException('Cloud account not found');
      }
    }

    const payload: Prisma.InputJsonValue = (dto.payload ?? {}) as Prisma.InputJsonValue;

    // 1) Persist Job before touching Redis
    const job = await this.prisma.job.create({
      data: {
        type: dto.type,
        status: JobStatus.PENDING,
        cloudAccountId: cloudAccountId ?? null,
        resourceId: dto.resourceId ?? null,
        requestedBy: actor.id,
        payload,
        idempotencyKey: dto.idempotencyKey ?? null,
        priority: dto.priority ?? 0,
        maxAttempts: dto.maxAttempts ?? 3,
        progress: 0,
      },
    });

    await this.addEvent(job.id, 'JOB_CREATED', 'Job created and waiting to enqueue', 0, {
      type: job.type,
      cloudAccountId: job.cloudAccountId,
    });

    // 2) Publish minimal payload to BullMQ
    const enqueueError = await this.tryEnqueue(job);

    const refreshed = await this.prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });

    return {
      job: this.toPublic(refreshed, { enqueueError }),
      accepted: true,
    };
  }

  /**
   * Convenience for resource sync endpoint.
   */
  async enqueueResourceSync(params: {
    cloudAccountId: string;
    payload: Record<string, unknown>;
    actor: User;
    idempotencyKey?: string;
  }): Promise<CreateJobResult> {
    return this.createAndEnqueue(
      {
        type: JobType.RESOURCE_SYNC,
        cloudAccountId: params.cloudAccountId,
        payload: params.payload,
        idempotencyKey: params.idempotencyKey,
      },
      params.actor,
    );
  }

  async enqueueHealthCheck(params: {
    cloudAccountId: string;
    actor: User;
    idempotencyKey?: string;
  }): Promise<CreateJobResult> {
    return this.createAndEnqueue(
      {
        type: JobType.HEALTH_CHECK,
        cloudAccountId: params.cloudAccountId,
        payload: { cloudAccountId: params.cloudAccountId },
        idempotencyKey: params.idempotencyKey,
      },
      params.actor,
    );
  }

  async findAll(query: ListJobsDto, actor: User) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.JobWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.cloudAccountId) where.cloudAccountId = query.cloudAccountId;

    // Viewers only see their own jobs
    if (actor.role === UserRole.VIEWER) {
      where.requestedBy = actor.id;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      data: items.map((j) => this.toPublic(j)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string, actor: User): Promise<PublicJob> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (actor.role === UserRole.VIEWER && job.requestedBy !== actor.id) {
      throw new NotFoundException('Job not found');
    }
    return this.toPublic(job);
  }

  async listExecutions(jobId: string, actor: User) {
    await this.findById(jobId, actor);

    const executions = await this.prisma.jobExecution.findMany({
      where: { jobId },
      orderBy: { attemptNumber: 'desc' },
    });

    return executions.map((e) => ({
      id: e.id,
      jobId: e.jobId,
      attemptNumber: e.attemptNumber,
      workerName: e.workerName,
      status: e.status,
      startedAt: e.startedAt,
      finishedAt: e.finishedAt,
      durationMs: e.durationMs !== null ? Number(e.durationMs) : null,
      errorCode: e.errorCode,
      errorType: e.errorType,
      errorMessage: e.errorMessage,
      errorDetails: e.errorDetails,
      output: e.output,
      createdAt: e.createdAt,
    }));
  }

  async listEvents(jobId: string, actor: User) {
    await this.findById(jobId, actor);

    return this.prisma.jobEvent.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async cancel(id: string, actor: User): Promise<PublicJob> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (actor.role === UserRole.VIEWER && job.requestedBy !== actor.id) {
      throw new NotFoundException('Job not found');
    }

    if (TERMINAL_STATUSES.has(job.status)) {
      throw new BadRequestException(
        `Cannot cancel job in terminal status ${job.status}`,
      );
    }
    if (!CANCELLABLE_STATUSES.has(job.status)) {
      throw new BadRequestException(`Cannot cancel job in status ${job.status}`);
    }

    const updated = await this.prisma.job.update({
      where: { id },
      data: {
        status: JobStatus.CANCELLED,
        cancelledAt: new Date(),
        completedAt: new Date(),
      },
    });

    await this.addEvent(id, 'JOB_CANCELLED', 'Job cancelled by user', updated.progress, {
      cancelledBy: actor.id,
      previousStatus: job.status,
    });

    return this.toPublic(updated);
  }

  /**
   * Re-enqueue a PENDING job (e.g. after Redis outage).
   */
  async retryEnqueue(id: string, actor: User): Promise<PublicJob> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (job.status !== JobStatus.PENDING) {
      throw new BadRequestException('Only PENDING jobs can be re-enqueued');
    }

    const enqueueError = await this.tryEnqueue(job);
    const refreshed = await this.prisma.job.findUniqueOrThrow({ where: { id } });
    return this.toPublic(refreshed, { enqueueError });
  }

  /**
   * Manual retry for a failed, DLQ, or timed-out job.
   */
  async manualRetry(id: string, actor: User): Promise<PublicJob> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (actor.role === UserRole.VIEWER && job.requestedBy !== actor.id) {
      throw new NotFoundException('Job not found');
    }

    if (job.status === JobStatus.SUCCEEDED) {
      throw new BadRequestException('Cannot retry a job that has already completed successfully');
    }

    if (
      job.status === JobStatus.RUNNING ||
      job.status === JobStatus.QUEUED ||
      job.status === JobStatus.PENDING
    ) {
      throw new BadRequestException(`Cannot retry an active job in status ${job.status}`);
    }

    const newMaxAttempts =
      job.attemptsMade >= job.maxAttempts ? job.attemptsMade + 3 : job.maxAttempts;

    const resetJob = await this.prisma.job.update({
      where: { id },
      data: {
        status: JobStatus.PENDING,
        maxAttempts: newMaxAttempts,
        completedAt: null,
        cancelledAt: null,
      },
    });

    await this.addEvent(
      id,
      'JOB_MANUAL_RETRY',
      'Job manually retried by user',
      resetJob.progress,
      {
        retriedBy: actor.id,
        previousStatus: job.status,
        maxAttempts: newMaxAttempts,
      },
    );

    const enqueueError = await this.tryEnqueue(resetJob);
    const refreshed = await this.prisma.job.findUniqueOrThrow({ where: { id } });
    return this.toPublic(refreshed, { enqueueError });
  }


  private assertMvpType(type: JobType) {
    if (!MVP_TYPES.has(type)) {
      throw new BadRequestException(
        `Job type ${type} is not enabled in MVP. Supported: ${[...MVP_TYPES].join(', ')}`,
      );
    }
  }

  private queueNameForType(type: JobType): string {
    if (type === JobType.RESOURCE_SYNC) return QUEUE_JOB_NAMES.RESOURCE_SYNC;
    if (type === JobType.HEALTH_CHECK) return QUEUE_JOB_NAMES.HEALTH_CHECK;
    return type;
  }

  private async tryEnqueue(job: Job): Promise<string | null> {
    try {
      await this.queueService.enqueue(
        this.queueNameForType(job.type),
        { jobId: job.id },
        {
          bullJobId: job.id,
          priority: job.priority,
          attempts: job.maxAttempts,
        },
      );

      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.QUEUED,
          queuedAt: new Date(),
        },
      });

      await this.addEvent(job.id, 'JOB_QUEUED', 'Job published to BullMQ', 0, {
        queuePayload: { jobId: job.id },
      });

      return null;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to enqueue job to Redis';
      this.logger.error(
        `Enqueue failed for job ${job.id}; record retained as PENDING: ${message}`,
      );

      await this.addEvent(
        job.id,
        'ENQUEUE_FAILED',
        'Redis/BullMQ enqueue failed; job remains PENDING',
        0,
        { error: message },
      );

      // Job stays PENDING — never lost
      return message;
    }
  }

  private async addEvent(
    jobId: string,
    eventType: string,
    message: string | null,
    progress: number | null,
    payload: Record<string, unknown> = {},
  ) {
    await this.prisma.jobEvent.create({
      data: {
        jobId,
        eventType,
        message,
        progress,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
