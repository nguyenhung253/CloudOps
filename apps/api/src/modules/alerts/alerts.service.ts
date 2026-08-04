import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import {
  AlertStatus,
  IncidentSeverity,
  IncidentStatus,
  Prisma,
  User,
} from '@prisma/client';
import { ListAlertsDto } from './dto/list-alerts.dto';
import { CreateIncidentFromAlertDto } from './dto/create-incident-from-alert.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrometheusService } from '../metrics/prometheus.service';

const ALERT_INCLUDES = {
  alertRule: { select: { id: true, name: true, severity: true } },
  resource: { select: { id: true, name: true, resourceType: true, providerResourceId: true } },
  acknowledger: { select: { id: true, fullName: true, email: true } },
  resolver: { select: { id: true, fullName: true, email: true } },
} as const;

function severityToIncidentSeverity(severity: string): IncidentSeverity {
  switch (severity) {
    case 'CRITICAL': return IncidentSeverity.SEV1;
    case 'WARNING': return IncidentSeverity.SEV3;
    default: return IncidentSeverity.SEV4;
  }
}

/**
 * Build a deterministic fingerprint for alert deduplication within the cooldown window.
 */
function buildFingerprint(ruleId: string, resourceId: string | null): string {
  const resourceKey = resourceId ?? 'global';
  return `rule:${ruleId}:res:${resourceKey}`;
}

@Injectable()
export class AlertsService {
  private readonly alertsCreatedCounter: ReturnType<PrometheusService['registerCounter']>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly prometheus: PrometheusService,
  ) {
    this.alertsCreatedCounter = this.prometheus.registerCounter(
      'alerts_created_total',
      'Total number of alerts created',
      ['severity'],
    );
  }

  async findAll(filters: ListAlertsDto = {}, page = 1, limit = 20) {
    const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));

    const where: Prisma.AlertWhereInput = {};

    if (filters.alertRuleId) where.alertRuleId = filters.alertRuleId;
    if (filters.resourceId) where.resourceId = filters.resourceId;
    if (filters.status) where.status = filters.status;
    if (filters.severity) where.severity = filters.severity;
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { message: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.alert.findMany({
        where,
        include: ALERT_INCLUDES,
        orderBy: { lastTriggeredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.alert.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findByIdOrThrow(id: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: ALERT_INCLUDES,
    });
    if (!alert) {
      throw new NotFoundException(`Alert ${id} not found`);
    }
    return alert;
  }

  async findOne(id: string) {
    return this.findByIdOrThrow(id);
  }

  /**
   * Check whether a new alert should be suppressed due to cooldown.
   * Called by the rule evaluation engine before creating an alert.
   *
   * If within the cooldown window, bumps lastTriggeredAt on the existing
   * alert instead of creating a duplicate. Returns the suppression status
   * so the caller can decide to skip the alert creation pipeline.
   */
  async checkCooldown(
    alertRuleId: string,
    resourceId: string | null,
    cooldownSeconds: number,
  ): Promise<{ suppressed: boolean; existingAlertId: string | null }> {
    const fingerprint = buildFingerprint(alertRuleId, resourceId);
    const cooldownThreshold = new Date(Date.now() - cooldownSeconds * 1000);

    const existing = await this.prisma.alert.findFirst({
      where: {
        alertRuleId,
        fingerprint,
        status: AlertStatus.OPEN,
        lastTriggeredAt: { gte: cooldownThreshold },
      },
      select: { id: true },
      orderBy: { lastTriggeredAt: 'desc' },
    });

    if (existing) {
      await this.prisma.alert.update({
        where: { id: existing.id },
        data: { lastTriggeredAt: new Date() },
      });
      return { suppressed: true, existingAlertId: existing.id };
    }

    return { suppressed: false, existingAlertId: null };
  }

  async acknowledge(id: string, actor: User, requestId?: string) {
    // Optimistic lock: only update if currently OPEN
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.alert.updateMany({
        where: { id, status: AlertStatus.OPEN },
        data: {
          status: AlertStatus.ACKNOWLEDGED,
          acknowledgedAt: now,
          acknowledgedBy: actor.id,
        },
      });

      if (updated.count === 0) {
        const current = await tx.alert.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!current) {
          throw new NotFoundException(`Alert ${id} not found`);
        }
        throw new BadRequestException(
          `Cannot acknowledge alert in "${current.status}" status. Only OPEN alerts can be acknowledged.`,
        );
      }

      await tx.alertEvent.create({
        data: {
          alertId: id,
          eventType: 'ACKNOWLEDGED',
          actorUserId: actor.id,
          payload: {
            previousStatus: AlertStatus.OPEN,
            newStatus: AlertStatus.ACKNOWLEDGED,
            timestamp: now.toISOString(),
          },
        },
      });

      return tx.alert.findUnique({
        where: { id },
        include: ALERT_INCLUDES,
      });
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'ALERT_ACKNOWLEDGED',
      targetType: 'alert',
      targetId: id,
      requestId,
      metadata: {
        previousStatus: AlertStatus.OPEN,
        newStatus: AlertStatus.ACKNOWLEDGED,
      },
    });

    return result;
  }

  async resolve(id: string, actor: User, requestId?: string) {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const currentAlert = await tx.alert.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!currentAlert) {
        throw new NotFoundException(`Alert ${id} not found`);
      }

      if (currentAlert.status === AlertStatus.RESOLVED) {
        throw new BadRequestException('Alert is already resolved');
      }

      const previousStatus = currentAlert.status;

      await tx.alert.update({
        where: { id },
        data: {
          status: AlertStatus.RESOLVED,
          resolvedAt: now,
          resolvedBy: actor.id,
        },
      });

      await tx.alertEvent.create({
        data: {
          alertId: id,
          eventType: 'RESOLVED',
          actorUserId: actor.id,
          payload: {
            previousStatus,
            newStatus: AlertStatus.RESOLVED,
            timestamp: now.toISOString(),
          },
        },
      });

      return tx.alert.findUnique({
        where: { id },
        include: ALERT_INCLUDES,
      });
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'ALERT_RESOLVED',
      targetType: 'alert',
      targetId: id,
      requestId,
      metadata: {
        previousStatus: AlertStatus.ACKNOWLEDGED,
        newStatus: AlertStatus.RESOLVED,
      },
    });

    return result;
  }

  async createIncidentFromAlert(
    alertId: string,
    dto: CreateIncidentFromAlertDto,
    actor: User,
    requestId?: string,
  ) {
    const now = new Date();
    const dedupKey = `alert:${alertId}`;

    // All pre-checks AND mutations inside a single transaction — closes the TOCTOU window.
    // dedupKey has a DB-level UNIQUE constraint as safety net.
    const result = await this.prisma.$transaction(async (tx) => {
      const alert = await tx.alert.findUnique({ where: { id: alertId } });
      if (!alert) {
        throw new NotFoundException(`Alert ${alertId} not found`);
      }

      const existingLink = await tx.incidentAlert.findFirst({
        where: { alertId },
      });
      if (existingLink) {
        throw new BadRequestException(
          `Alert is already linked to incident ${existingLink.incidentId}`,
        );
      }

      const existingIncident = await tx.incident.findUnique({
        where: { dedupKey },
      });
      if (existingIncident) {
        throw new BadRequestException(
          `An incident (${existingIncident.id}) already exists for this alert`,
        );
      }

      const incidentSeverity = severityToIncidentSeverity(alert.severity);

      const incident = await tx.incident.create({
        data: {
          title: dto.title.trim(),
          description: dto.description.trim(),
          status: IncidentStatus.OPEN,
          severity: incidentSeverity,
          primaryResourceId: alert.resourceId,
          assigneeId: dto.assigneeId,
          createdBy: actor.id,
          createdByType: 'USER',
          dedupKey,
          ruleCode: `alert_rule:${alert.alertRuleId}`,
          latestMetricSnapshot: alert.observedValue !== null
            ? { observedValue: alert.observedValue, thresholdValue: alert.thresholdValue }
            : undefined,
          openedAt: now,
          lastObservedAt: now,
          occurrenceCount: 1,
        },
      });

      await tx.incidentAlert.create({
        data: {
          incidentId: incident.id,
          alertId: alert.id,
          linkedBy: actor.id,
          linkedAt: now,
        },
      });

      await tx.incidentTimeline.create({
        data: {
          incidentId: incident.id,
          eventType: 'INCIDENT_CREATED',
          actorUserId: actor.id,
          content: `Incident created from alert: ${alert.title}\n\n${dto.description}`,
          metadata: {
            alertId: alert.id,
            alertSeverity: alert.severity,
            observedValue: alert.observedValue,
            thresholdValue: alert.thresholdValue,
          },
        },
      });

      if (alert.resourceId) {
        await tx.incidentEvidence.create({
          data: {
            incidentId: incident.id,
            evidenceType: 'METRIC_SNAPSHOT',
            resourceId: alert.resourceId,
            snapshot: {
              alertId: alert.id,
              alertTitle: alert.title,
              observedValue: alert.observedValue,
              thresholdValue: alert.thresholdValue,
              firstTriggeredAt: alert.firstTriggeredAt,
              lastTriggeredAt: alert.lastTriggeredAt,
            },
            addedBy: actor.id,
          },
        });
      }

      return incident;
    });

    this.alertsCreatedCounter.inc({ severity: result.severity });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'INCIDENT_CREATED_FROM_ALERT',
      targetType: 'incident',
      targetId: result.id,
      requestId,
      metadata: {
        alertId,
        incidentTitle: dto.title,
        severity: result.severity,
      },
    });

    return result;
  }
}
