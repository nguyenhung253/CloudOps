import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import { QueueService, QUEUE_JOB_NAMES } from '@app/queue';
import {
  JobSchedule,
  JobStatus,
  JobType,
  ScheduleJobType,
  User,
} from '@prisma/client';
import { CreateScheduleDto, ALLOWED_INTERVALS } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

/** Map ScheduleJobType → JobType for creating actual jobs. */
const SCHEDULE_TO_JOB_TYPE: Record<ScheduleJobType, JobType> = {
  [ScheduleJobType.RESOURCE_SYNC]: JobType.RESOURCE_SYNC,
  [ScheduleJobType.METRIC_COLLECTION]: JobType.METRIC_COLLECTION,
};

/** Map ScheduleJobType → BullMQ queue job name. */
const SCHEDULE_TO_QUEUE_NAME: Record<ScheduleJobType, string> = {
  [ScheduleJobType.RESOURCE_SYNC]: QUEUE_JOB_NAMES.RESOURCE_SYNC,
  [ScheduleJobType.METRIC_COLLECTION]: QUEUE_JOB_NAMES.METRIC_COLLECTION,
};

function buildSchedulerKey(jobType: ScheduleJobType, cloudAccountId: string): string {
  return `schedule:${jobType}:${cloudAccountId}`;
}

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  /* ------------------------------------------------------------------ */
  /*  LIST                                                               */
  /* ------------------------------------------------------------------ */
  async findAll() {
    return this.prisma.jobSchedule.findMany({
      include: {
        cloudAccount: {
          select: { id: true, name: true, provider: true, providerAccountId: true },
        },
        creator: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /* ------------------------------------------------------------------ */
  /*  CREATE                                                             */
  /* ------------------------------------------------------------------ */
  async create(dto: CreateScheduleDto, user: User) {
    // 1. Validate interval is in allowed list
    const allowed = ALLOWED_INTERVALS[dto.jobType];
    if (!allowed || !allowed.includes(dto.intervalMs)) {
      throw new BadRequestException(
        `Invalid intervalMs=${dto.intervalMs} for ${dto.jobType}. Allowed: ${allowed?.join(', ')}`,
      );
    }

    // 2. Validate cloud account exists
    const account = await this.prisma.cloudAccount.findUnique({
      where: { id: dto.cloudAccountId },
    });
    if (!account) {
      throw new NotFoundException(`Cloud account ${dto.cloudAccountId} not found`);
    }

    // 3. Check unique constraint before hitting DB
    const existing = await this.prisma.jobSchedule.findUnique({
      where: {
        cloudAccountId_jobType: {
          cloudAccountId: dto.cloudAccountId,
          jobType: dto.jobType,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Schedule for ${dto.jobType} on account ${account.name} already exists`,
      );
    }

    // 4. Create in DB
    const schedulerKey = buildSchedulerKey(dto.jobType, dto.cloudAccountId);
    const enabled = dto.enabled ?? true;
    const nextRunAt = enabled ? new Date(Date.now() + dto.intervalMs) : null;

    const schedule = await this.prisma.jobSchedule.create({
      data: {
        jobType: dto.jobType,
        cloudAccountId: dto.cloudAccountId,
        intervalMs: dto.intervalMs,
        enabled,
        schedulerKey,
        nextRunAt,
        createdBy: user.id,
      },
      include: {
        cloudAccount: {
          select: { id: true, name: true, provider: true, providerAccountId: true },
        },
      },
    });

    // 5. Upsert BullMQ job scheduler if enabled
    if (enabled) {
      try {
        await this.queueService.upsertScheduler(
          schedulerKey,
          SCHEDULE_TO_QUEUE_NAME[dto.jobType],
          dto.intervalMs,
          { jobId: schedule.id },
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to upsert BullMQ scheduler: ${msg}`);
      }
    }

    this.logger.log(`Created schedule ${schedule.id} [${dto.jobType}] for account ${account.name}`);
    return schedule;
  }

  /* ------------------------------------------------------------------ */
  /*  UPDATE                                                             */
  /* ------------------------------------------------------------------ */
  async update(id: string, dto: UpdateScheduleDto) {
    const schedule = await this.prisma.jobSchedule.findUnique({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Schedule ${id} not found`);
    }

    // Validate new interval if provided
    if (dto.intervalMs !== undefined) {
      const allowed = ALLOWED_INTERVALS[schedule.jobType];
      if (!allowed || !allowed.includes(dto.intervalMs)) {
        throw new BadRequestException(
          `Invalid intervalMs=${dto.intervalMs} for ${schedule.jobType}. Allowed: ${allowed?.join(', ')}`,
        );
      }
    }

    const newEnabled = dto.enabled ?? schedule.enabled;
    const newIntervalMs = dto.intervalMs ?? schedule.intervalMs;
    const nextRunAt = newEnabled ? new Date(Date.now() + newIntervalMs) : null;

    const updated = await this.prisma.jobSchedule.update({
      where: { id },
      data: {
        intervalMs: newIntervalMs,
        enabled: newEnabled,
        nextRunAt,
      },
      include: {
        cloudAccount: {
          select: { id: true, name: true, provider: true, providerAccountId: true },
        },
      },
    });

    // Sync BullMQ scheduler
    try {
      if (newEnabled) {
        await this.queueService.upsertScheduler(
          schedule.schedulerKey,
          SCHEDULE_TO_QUEUE_NAME[schedule.jobType],
          newIntervalMs,
          { jobId: schedule.id },
        );
      } else {
        await this.queueService.removeScheduler(schedule.schedulerKey);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to sync BullMQ scheduler: ${msg}`);
    }

    return updated;
  }

  /* ------------------------------------------------------------------ */
  /*  DELETE                                                             */
  /* ------------------------------------------------------------------ */
  async remove(id: string) {
    const schedule = await this.prisma.jobSchedule.findUnique({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Schedule ${id} not found`);
    }

    await this.prisma.jobSchedule.delete({ where: { id } });

    // Remove BullMQ scheduler
    try {
      await this.queueService.removeScheduler(schedule.schedulerKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to remove BullMQ scheduler: ${msg}`);
    }

    this.logger.log(`Deleted schedule ${id} [${schedule.jobType}]`);
    return { deleted: true };
  }

  /* ------------------------------------------------------------------ */
  /*  RUN NOW                                                            */
  /* ------------------------------------------------------------------ */
  async runNow(id: string, user: User) {
    const schedule = await this.prisma.jobSchedule.findUnique({
      where: { id },
      include: { cloudAccount: true },
    });
    if (!schedule) {
      throw new NotFoundException(`Schedule ${id} not found`);
    }

    const jobType = SCHEDULE_TO_JOB_TYPE[schedule.jobType];
    const queueName = SCHEDULE_TO_QUEUE_NAME[schedule.jobType];

    // Create a one-shot job in PostgreSQL
    const job = await this.prisma.job.create({
      data: {
        type: jobType,
        status: JobStatus.PENDING,
        cloudAccountId: schedule.cloudAccountId,
        payload: {
          cloudAccountId: schedule.cloudAccountId,
          isScheduled: false,
          triggeredBy: 'manual_run_now',
        },
        requestedBy: user.id,
        maxAttempts: 3,
        priority: 0,
      },
    });

    // Enqueue to BullMQ
    await this.queueService.enqueue(
      queueName,
      { jobId: job.id },
      { bullJobId: job.id, attempts: 3 },
    );

    await this.prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.QUEUED, queuedAt: new Date() },
    });

    // Update lastRunAt
    await this.prisma.jobSchedule.update({
      where: { id },
      data: { lastRunAt: new Date() },
    });

    this.logger.log(`Run now: schedule ${id} → job ${job.id}`);
    return { jobId: job.id, accepted: true };
  }
}
