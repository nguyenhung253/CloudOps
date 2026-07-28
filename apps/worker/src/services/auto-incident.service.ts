import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { IncidentSeverity, IncidentStatus, Prisma } from '@prisma/client';
import { NotificationDispatcher } from './notification-dispatcher.service';
import type { ResourceHealthEvaluation } from '../evaluators/resource-health.evaluator';

@Injectable()
export class AutoIncidentService {
  private readonly logger = new Logger(AutoIncidentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationDispatcher: NotificationDispatcher,
  ) {}

  async dispatchForResource(
    resource: { id: string; name: string | null; providerResourceId: string; cloudAccountId: string },
    evaluation: ResourceHealthEvaluation,
  ): Promise<number> {
    let createdOrUpdatedCount = 0;

    for (const ruleResult of evaluation.ruleResults) {
      if (!ruleResult.triggered) continue;

      const dedupKey = `${resource.providerResourceId}:${ruleResult.ruleCode}`;

      try {
        await this.prisma.$transaction(async (tx) => {
          const existing = await tx.incident.findFirst({
            where: {
              dedupKey,
              status: { in: [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING] },
            },
          });

          if (existing) {
            this.logger.log(
              `Deduplicated incident for ${dedupKey} (Incident ID: ${existing.id}, count=${existing.occurrenceCount + 1})`,
            );

            const dataToUpdate: Prisma.IncidentUpdateInput = {
              occurrenceCount: existing.occurrenceCount + 1,
              lastObservedAt: new Date(),
              latestMetricSnapshot: evaluation.latestMetrics as Prisma.InputJsonValue,
            };

            const isSeverityEscalated =
              ruleResult.severity === IncidentSeverity.SEV1 &&
              existing.severity !== IncidentSeverity.SEV1;

            if (isSeverityEscalated) {
              dataToUpdate.severity = IncidentSeverity.SEV1;
            }

            await tx.incident.update({
              where: { id: existing.id },
              data: dataToUpdate,
            });

            if (isSeverityEscalated) {
              await tx.incidentTimeline.create({
                data: {
                  incidentId: existing.id,
                  eventType: 'SEVERITY_ESCALATED',
                  content: `Severity escalated from ${existing.severity} to SEV1: ${ruleResult.reason}`,
                  actorUserId: null,
                },
              });
            }
            createdOrUpdatedCount++;
          } else {
            const title = `[${ruleResult.ruleCode}] ${ruleResult.reason} on ${resource.name ?? resource.providerResourceId}`;

            const incident = await tx.incident.create({
              data: {
                title,
                description: `Automated incident dispatched by CloudOps Rule Engine. ${ruleResult.reason}`,
                status: IncidentStatus.OPEN,
                severity: ruleResult.severity,
                primaryResourceId: resource.id,
                createdByType: 'SYSTEM',
                createdBy: null,
                dedupKey,
                ruleCode: ruleResult.ruleCode,
                openedAt: new Date(),
                latestMetricSnapshot: evaluation.latestMetrics as Prisma.InputJsonValue,
              },
            });

            await tx.incidentEvidence.create({
              data: {
                incidentId: incident.id,
                evidenceType: 'METRIC_SNAPSHOT',
                resourceId: resource.id,
                addedBy: null,
                snapshot: {
                  summary: ruleResult.reason,
                  ruleCode: ruleResult.ruleCode,
                  observedValue: ruleResult.observedValue,
                  threshold: ruleResult.threshold,
                  latestMetrics: evaluation.latestMetrics,
                } as Prisma.InputJsonValue,
              },
            });

            await tx.incidentTimeline.create({
              data: {
                incidentId: incident.id,
                eventType: 'INCIDENT_OPENED',
                content: `Incident #${incident.incidentNumber} automatically created by CloudOps Rule Engine for ${ruleResult.ruleCode}`,
                actorUserId: null,
              },
            });

            await this.notificationDispatcher.dispatchIncidentNotification(tx, {
              incidentId: incident.id,
              title: incident.title,
              reason: ruleResult.reason,
            });

            this.logger.log(`Created new Incident #${incident.incidentNumber} for ${dedupKey}`);
            createdOrUpdatedCount++;
          }
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error in AutoIncidentService transaction for ${dedupKey}: ${msg}`);
      }
    }

    return createdOrUpdatedCount;
  }
}
