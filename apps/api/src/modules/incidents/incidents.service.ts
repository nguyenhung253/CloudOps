import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import {
  IncidentSeverity,
  IncidentStatus,
  NotificationSource,
  Prisma,
  User,
} from '@prisma/client';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import { AddTimelineDto } from './dto/add-timeline.dto';
import { AddEvidenceDto } from './dto/add-evidence.dto';
import { ListIncidentsDto } from './dto/list-incidents.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationService } from '../notifications/notification.service';

const INCIDENT_INCLUDES = {
  primaryResource: { select: { id: true, name: true, resourceType: true, providerResourceId: true } },
  creator: { select: { id: true, fullName: true, email: true } },
  assignee: { select: { id: true, fullName: true, email: true } },
  alerts: {
    include: {
      alert: { select: { id: true, title: true, severity: true, status: true } },
    },
  },
} as const;

const VALID_STATUS_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  [IncidentStatus.OPEN]: [IncidentStatus.INVESTIGATING],
  [IncidentStatus.INVESTIGATING]: [IncidentStatus.MITIGATED, IncidentStatus.OPEN],
  [IncidentStatus.MITIGATED]: [IncidentStatus.RESOLVED, IncidentStatus.INVESTIGATING],
  [IncidentStatus.RESOLVED]: [IncidentStatus.CLOSED, IncidentStatus.INVESTIGATING],
  [IncidentStatus.CLOSED]: [IncidentStatus.INVESTIGATING],
};

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

  async findAll(filters: ListIncidentsDto = {}, page = 1, limit = 20) {
    const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));

    const where: Prisma.IncidentWhereInput = {};

    if (filters.primaryResourceId) where.primaryResourceId = filters.primaryResourceId;
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.status) where.status = filters.status as IncidentStatus;
    if (filters.severity) where.severity = filters.severity as IncidentSeverity;
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.incident.findMany({
        where,
        include: INCIDENT_INCLUDES,
        orderBy: { openedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.incident.count({ where }),
    ]);

    return {
      data: items.map((item) => ({
        id: item.id,
        incidentNumber: item.incidentNumber ? item.incidentNumber.toString() : item.id.slice(0, 8),
        title: item.title,
        description: item.description,
        status: item.status,
        severity: item.severity,
        primaryResource: item.primaryResource,
        createdBy: item.createdBy,
        createdByType: item.createdByType ?? (item.createdBy ? 'USER' : 'SYSTEM'),
        creator: item.creator
          ? { id: item.creator.id, name: item.creator.fullName, email: item.creator.email }
          : null,
        assignee: item.assignee
          ? { id: item.assignee.id, name: item.assignee.fullName, email: item.assignee.email }
          : null,
        alerts: item.alerts.map((a) => a.alert),
        occurrenceCount: item.occurrenceCount,
        lastObservedAt: item.lastObservedAt,
        openedAt: item.openedAt,
        createdAt: item.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const item = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        primaryResource: true,
        creator: { select: { id: true, fullName: true, email: true } },
        assignee: { select: { id: true, fullName: true, email: true } },
        alerts: {
          include: {
            alert: {
              include: {
                alertRule: { select: { id: true, name: true } },
                resource: { select: { id: true, name: true, resourceType: true } },
              },
            },
          },
        },
        evidence: {
          include: {
            resource: { select: { id: true, name: true, resourceType: true } },
            jobExecution: { select: { id: true, status: true, startedAt: true } },
            adder: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        timeline: {
          include: {
            actor: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!item) throw new NotFoundException(`Incident ${id} not found`);

    return {
      ...item,
      incidentNumber: item.incidentNumber ? item.incidentNumber.toString() : item.id.slice(0, 8),
      createdByType: item.createdByType ?? (item.createdBy ? 'USER' : 'SYSTEM'),
      creator: item.creator
        ? { id: item.creator.id, name: item.creator.fullName, email: item.creator.email }
        : null,
      assignee: item.assignee
        ? { id: item.assignee.id, name: item.assignee.fullName, email: item.assignee.email }
        : null,
      alerts: item.alerts.map((a) => a.alert),
    };
  }

  async create(dto: CreateIncidentDto, actor: User, requestId?: string) {
    const now = new Date();
    const dedupKey = `manual:${actor.id}:${Date.now()}`;

    const incident = await this.prisma.$transaction(async (tx) => {
      const created = await tx.incident.create({
        data: {
          title: dto.title.trim(),
          description: dto.description.trim(),
          status: IncidentStatus.OPEN,
          severity: dto.severity,
          primaryResourceId: dto.primaryResourceId ?? null,
          assigneeId: dto.assigneeId ?? null,
          createdBy: actor.id,
          createdByType: 'USER',
          dedupKey,
          openedAt: now,
          lastObservedAt: now,
          occurrenceCount: 1,
        },
        include: INCIDENT_INCLUDES,
      });

      // Auto-add timeline — same transaction so we don't leave orphan incidents
      await tx.incidentTimeline.create({
        data: {
          incidentId: created.id,
          eventType: 'INCIDENT_CREATED',
          actorUserId: actor.id,
          content: `Incident created: ${dto.title}\n\n${dto.description}`,
          metadata: { severity: dto.severity, primaryResourceId: dto.primaryResourceId },
        },
      });

      return created;
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'INCIDENT_CREATED',
      targetType: 'incident',
      targetId: incident.id,
      requestId,
      metadata: {
        title: dto.title,
        severity: dto.severity,
      },
    });

    // Emit notification (best-effort, outside transaction)
    this.notificationService.create({
      type: 'INCIDENT_CREATED',
      source: NotificationSource.INCIDENT,
      severity: dto.severity === IncidentSeverity.SEV1 ? 'CRITICAL' : dto.severity === IncidentSeverity.SEV2 ? 'CRITICAL' : 'WARNING',
      title: `Incident: ${dto.title}`,
      message: dto.description.trim() || dto.title,
      resourceId: dto.primaryResourceId ?? undefined,
      incidentId: incident.id,
    }).catch((err) => this.logger?.warn?.(`Failed to emit notification: ${err.message}`));

    return incident;
  }

  async updateStatus(
    id: string,
    dto: UpdateIncidentStatusDto,
    actor: User,
    requestId?: string,
  ) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);

    const allowedTransitions = VALID_STATUS_TRANSITIONS[incident.status];
    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition incident from "${incident.status}" to "${dto.status}". ` +
        `Allowed transitions: ${allowedTransitions.join(', ')}`,
      );
    }

    const now = new Date();
    const statusTimestamps: Prisma.IncidentUpdateInput = {};
    const timelineEventType = `STATUS_${dto.status}`;

    if (dto.status === IncidentStatus.MITIGATED) {
      statusTimestamps.mitigatedAt = now;
    } else if (dto.status === IncidentStatus.RESOLVED) {
      statusTimestamps.resolvedAt = now;
    } else if (dto.status === IncidentStatus.CLOSED) {
      statusTimestamps.closedAt = now;
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.incident.update({
        where: { id },
        data: {
          status: dto.status,
          ...statusTimestamps,
        },
        include: INCIDENT_INCLUDES,
      }),
      this.prisma.incidentTimeline.create({
        data: {
          incidentId: id,
          eventType: timelineEventType,
          actorUserId: actor.id,
          content: `Status changed from ${incident.status} to ${dto.status}`,
          metadata: { previousStatus: incident.status, newStatus: dto.status },
        },
      }),
    ]);

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'INCIDENT_STATUS_UPDATED',
      targetType: 'incident',
      targetId: id,
      requestId,
      metadata: {
        previousStatus: incident.status,
        newStatus: dto.status,
        title: incident.title,
      },
    });

    return updated;
  }

  async addTimeline(
    incidentId: string,
    dto: AddTimelineDto,
    actor: User,
    requestId?: string,
  ) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);

    const entry = await this.prisma.incidentTimeline.create({
      data: {
        incidentId,
        eventType: dto.eventType,
        actorUserId: actor.id,
        content: dto.content,
        metadata: dto.metadata ?? {},
      },
      include: {
        actor: { select: { id: true, fullName: true, email: true } },
      },
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'INCIDENT_TIMELINE_ADDED',
      targetType: 'incident',
      targetId: incidentId,
      requestId,
      metadata: {
        eventType: dto.eventType,
        incidentTitle: incident.title,
      },
    });

    return entry;
  }

  async addEvidence(
    incidentId: string,
    dto: AddEvidenceDto,
    actor: User,
    requestId?: string,
  ) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);

    const evidence = await this.prisma.incidentEvidence.create({
      data: {
        incidentId,
        evidenceType: dto.evidenceType,
        jobExecutionId: dto.jobExecutionId ?? null,
        logQueryResultId: dto.logQueryResultId ?? null,
        resourceId: dto.resourceId ?? null,
        externalUrl: dto.externalUrl ?? null,
        snapshot: dto.snapshot ?? null,
        addedBy: actor.id,
      },
      include: {
        resource: { select: { id: true, name: true, resourceType: true } },
        jobExecution: { select: { id: true, status: true } },
        adder: { select: { id: true, fullName: true } },
      },
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'INCIDENT_EVIDENCE_ADDED',
      targetType: 'incident',
      targetId: incidentId,
      requestId,
      metadata: {
        evidenceType: dto.evidenceType,
        incidentTitle: incident.title,
      },
    });

    return evidence;
  }

  async addRootCause(
    id: string,
    rootCause: string,
    actor: User,
    requestId?: string,
  ) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);

    const [updated] = await this.prisma.$transaction([
      this.prisma.incident.update({
        where: { id },
        data: { rootCause },
      }),
      this.prisma.incidentTimeline.create({
        data: {
          incidentId: id,
          eventType: 'ROOT_CAUSE_ADDED',
          actorUserId: actor.id,
          content: `Root cause identified: ${rootCause}`,
          metadata: { rootCause },
        },
      }),
    ]);

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'INCIDENT_ROOT_CAUSE_ADDED',
      targetType: 'incident',
      targetId: id,
      requestId,
      metadata: { incidentTitle: incident.title },
    });

    return updated;
  }

  async addResolutionNote(
    id: string,
    resolutionNote: string,
    actor: User,
    requestId?: string,
  ) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);

    const [updated] = await this.prisma.$transaction([
      this.prisma.incident.update({
        where: { id },
        data: { resolutionNote },
      }),
      this.prisma.incidentTimeline.create({
        data: {
          incidentId: id,
          eventType: 'RESOLUTION_NOTED',
          actorUserId: actor.id,
          content: `Resolution note: ${resolutionNote}`,
          metadata: { resolutionNote },
        },
      }),
    ]);

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'INCIDENT_RESOLUTION_NOTED',
      targetType: 'incident',
      targetId: id,
      requestId,
      metadata: { incidentTitle: incident.title },
    });

    return updated;
  }
}
