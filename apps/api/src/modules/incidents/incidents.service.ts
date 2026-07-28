import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@app/database';

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const list = await this.prisma.incident.findMany({
      include: {
        primaryResource: { select: { id: true, name: true, providerResourceId: true } },
        creator: { select: { id: true, fullName: true, email: true } },
        assignee: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: 20,
    });

    return list.map((item) => ({
      id: item.id,
      incidentNumber: item.incidentNumber ? item.incidentNumber.toString() : item.id.slice(0, 8),
      title: item.title,
      description: item.description,
      status: item.status,
      severity: item.severity,
      primaryResourceId: item.primaryResourceId,
      primaryResource: item.primaryResource,
      createdByType: item.createdByType ?? (item.createdBy ? 'USER' : 'SYSTEM'),
      createdBy: item.createdBy,
      creator: item.creator
        ? { id: item.creator.id, name: item.creator.fullName, email: item.creator.email }
        : null,
      assignee: item.assignee
        ? { id: item.assignee.id, name: item.assignee.fullName, email: item.assignee.email }
        : null,
      dedupKey: item.dedupKey,
      ruleCode: item.ruleCode,
      occurrenceCount: item.occurrenceCount,
      lastObservedAt: item.lastObservedAt,
      latestMetricSnapshot: item.latestMetricSnapshot,
      openedAt: item.openedAt,
      createdAt: item.createdAt,
    }));
  }

  async findOne(id: string) {
    const item = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        primaryResource: true,
        creator: { select: { id: true, fullName: true, email: true } },
        assignee: { select: { id: true, fullName: true, email: true } },
        evidence: true,
        timeline: { orderBy: { createdAt: 'desc' } },
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
    };
  }
}
