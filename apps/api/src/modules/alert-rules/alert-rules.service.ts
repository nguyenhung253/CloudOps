import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import { AlertRule, AlertSeverity, Prisma, User, UserRole } from '@prisma/client';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';
import { ListAlertRulesDto } from './dto/list-alert-rules.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

const ALERT_RULE_INCLUDES = {
  cloudAccount: { select: { id: true, name: true, provider: true } },
  resource: { select: { id: true, name: true, resourceType: true, providerResourceId: true } },
  metricDefinition: { select: { id: true, metricName: true, namespace: true, resourceType: true } },
  creator: { select: { id: true, fullName: true, email: true } },
} as const;

@Injectable()
export class AlertRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Non-admin users can only manage alert rules on cloud accounts they created.
   */
  private async assertCloudAccountAccess(cloudAccountId: string, actor: User): Promise<void> {
    if (actor.role === UserRole.ADMIN) return;

    const account = await this.prisma.cloudAccount.findFirst({
      where: { id: cloudAccountId, createdBy: actor.id, deletedAt: null },
      select: { id: true },
    });
    if (!account) {
      throw new ForbiddenException(
        'You do not have access to this cloud account',
      );
    }
  }

  async create(dto: CreateAlertRuleDto, actor: User, requestId?: string) {
    const existing = await this.prisma.alertRule.findFirst({
      where: {
        name: dto.name.trim(),
        cloudAccountId: dto.cloudAccountId,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Alert rule "${dto.name}" already exists for this cloud account`,
      );
    }

    await this.assertCloudAccountAccess(dto.cloudAccountId, actor);

    // Validate resourceId belongs to the specified cloud account
    if (dto.resourceId) {
      const resource = await this.prisma.cloudResource.findFirst({
        where: { id: dto.resourceId, cloudAccountId: dto.cloudAccountId, isActive: true },
        select: { id: true },
      });
      if (!resource) {
        throw new BadRequestException(
          `Resource not found or does not belong to the specified cloud account`,
        );
      }
    }

    const rule = await this.prisma.alertRule.create({
      data: {
        name: dto.name.trim(),
        cloudAccountId: dto.cloudAccountId,
        resourceId: dto.resourceId ?? null,
        resourceType: dto.resourceType ?? null,
        metricDefinitionId: dto.metricDefinitionId ?? null,
        operator: dto.operator,
        threshold: dto.threshold,
        durationSeconds: dto.durationSeconds,
        severity: dto.severity,
        cooldownSeconds: dto.cooldownSeconds,
        recoveryThreshold: dto.recoveryThreshold ?? null,
        isEnabled: dto.isEnabled ?? true,
        createdBy: actor.id,
      },
      include: ALERT_RULE_INCLUDES,
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'ALERT_RULE_CREATED',
      targetType: 'alert_rule',
      targetId: rule.id,
      requestId,
      metadata: {
        name: rule.name,
        severity: rule.severity,
        operator: rule.operator,
        threshold: rule.threshold,
        cloudAccountId: rule.cloudAccountId,
      },
    });

    return rule;
  }

  async findAll(
    filters: ListAlertRulesDto = {},
    page = 1,
    limit = 20,
  ) {
    const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));

    const where: Prisma.AlertRuleWhereInput = {
      deletedAt: null,
    };

    if (filters.cloudAccountId) {
      where.cloudAccountId = filters.cloudAccountId;
    }
    if (filters.resourceId) {
      where.resourceId = filters.resourceId;
    }
    if (filters.resourceType) {
      where.resourceType = filters.resourceType;
    }
    if (filters.severity) {
      where.severity = filters.severity;
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { resourceType: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.alertRule.findMany({
        where,
        include: ALERT_RULE_INCLUDES,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.alertRule.count({ where }),
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

  async findByIdOrThrow(id: string): Promise<AlertRule> {
    const rule = await this.prisma.alertRule.findFirst({
      where: { id, deletedAt: null },
      include: ALERT_RULE_INCLUDES,
    });
    if (!rule) {
      throw new NotFoundException(`Alert rule ${id} not found`);
    }
    return rule;
  }

  async findOne(id: string) {
    return this.findByIdOrThrow(id);
  }

  async update(id: string, dto: UpdateAlertRuleDto, actor: User, requestId?: string) {
    const existing = await this.findByIdOrThrow(id);

    // Verify access to the current cloud account
    await this.assertCloudAccountAccess(existing.cloudAccountId, actor);
    // If changing cloud account, verify access to the new one too
    if (dto.cloudAccountId !== undefined) {
      await this.assertCloudAccountAccess(dto.cloudAccountId, actor);
    }

    const data: Prisma.AlertRuleUncheckedUpdateInput = {};

    if (dto.name !== undefined) {
      // Check uniqueness
      const conflict = await this.prisma.alertRule.findFirst({
        where: {
          name: dto.name.trim(),
          cloudAccountId: existing.cloudAccountId,
          id: { not: id },
          deletedAt: null,
        },
      });
      if (conflict) {
        throw new ConflictException(
          `Alert rule "${dto.name}" already exists for this cloud account`,
        );
      }
      data.name = dto.name.trim();
    }
    if (dto.cloudAccountId !== undefined) data.cloudAccountId = dto.cloudAccountId;
    if (dto.resourceId !== undefined) data.resourceId = dto.resourceId;
    if (dto.resourceType !== undefined) data.resourceType = dto.resourceType;
    if (dto.metricDefinitionId !== undefined) data.metricDefinitionId = dto.metricDefinitionId;
    if (dto.operator !== undefined) data.operator = dto.operator;
    if (dto.threshold !== undefined) data.threshold = dto.threshold;
    if (dto.durationSeconds !== undefined) data.durationSeconds = dto.durationSeconds;
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.cooldownSeconds !== undefined) data.cooldownSeconds = dto.cooldownSeconds;
    if (dto.recoveryThreshold !== undefined) data.recoveryThreshold = dto.recoveryThreshold;
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;

    const rule = await this.prisma.alertRule.update({
      where: { id },
      data,
      include: ALERT_RULE_INCLUDES,
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'ALERT_RULE_UPDATED',
      targetType: 'alert_rule',
      targetId: id,
      requestId,
      metadata: {
        fields: Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined),
        previousName: existing.name,
        newName: rule.name,
      },
    });

    return rule;
  }

  async enable(id: string, actor: User, requestId?: string) {
    const rule = await this.findByIdOrThrow(id);

    if (rule.isEnabled) {
      return { id, isEnabled: true, message: 'Rule is already enabled' };
    }

    const updated = await this.prisma.alertRule.update({
      where: { id },
      data: { isEnabled: true },
      include: ALERT_RULE_INCLUDES,
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'ALERT_RULE_ENABLED',
      targetType: 'alert_rule',
      targetId: id,
      requestId,
      metadata: { name: rule.name },
    });

    return updated;
  }

  async disable(id: string, actor: User, requestId?: string) {
    const rule = await this.findByIdOrThrow(id);

    if (!rule.isEnabled) {
      return { id, isEnabled: false, message: 'Rule is already disabled' };
    }

    const updated = await this.prisma.alertRule.update({
      where: { id },
      data: { isEnabled: false },
      include: ALERT_RULE_INCLUDES,
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'ALERT_RULE_DISABLED',
      targetType: 'alert_rule',
      targetId: id,
      requestId,
      metadata: { name: rule.name },
    });

    return updated;
  }

  async softDelete(id: string, actor: User, requestId?: string) {
    await this.findByIdOrThrow(id);

    await this.prisma.alertRule.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isEnabled: false,
      },
    });

    await this.auditLogsService.create({
      actorUserId: actor.id,
      action: 'ALERT_RULE_DELETED',
      targetType: 'alert_rule',
      targetId: id,
      requestId,
    });
  }
}
