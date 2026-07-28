import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { GetMetricsQueryDto } from './dto/get-metrics-query.dto';


@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getResourceMetrics(resourceId: string, query: GetMetricsQueryDto) {
    const resource = await this.prisma.cloudResource.findUnique({
      where: { id: resourceId },
    });
    if (!resource) {
      throw new NotFoundException(`Resource ${resourceId} not found`);
    }

    const now = new Date();
    const end = query.endTime ? new Date(query.endTime) : now;
    const start = query.startTime
      ? new Date(query.startTime)
      : new Date(end.getTime() - 24 * 60 * 60 * 1000); // default 24h

    const wherePoint: any = {
      resourceId,
      timestamp: {
        gte: start,
        lte: end,
      },
    };

    if (query.metricName) {
      const def = await this.prisma.metricDefinition.findFirst({
        where: { metricName: query.metricName },
      });
      if (def) {
        wherePoint.metricDefinitionId = def.id;
      }
    }

    const points = await this.prisma.metricPoint.findMany({
      where: wherePoint,
      include: { metricDefinition: true },
      orderBy: { timestamp: 'asc' },
      take: 1000,
    });

    const aggregates = await this.prisma.metricAggregate.findMany({
      where: {
        resourceId,
        bucketStart: {
          gte: start,
          lte: end,
        },
      },
      include: { metricDefinition: true },
      orderBy: { bucketStart: 'asc' },
      take: 500,
    });

    return {
      resourceId: resource.id,
      providerResourceId: resource.providerResourceId,
      startTime: start,
      endTime: end,
      totalPoints: points.length,
      points: points.map((p) => ({
        id: p.id.toString(),
        metricName: p.metricDefinition.metricName,
        timestamp: p.timestamp,
        value: p.value,
        unit: p.unit,
      })),
      aggregates: aggregates.map((a) => ({
        id: a.id.toString(),
        metricName: a.metricDefinition.metricName,
        bucketStart: a.bucketStart,
        bucketSize: a.bucketSize,
        minValue: a.minValue,
        maxValue: a.maxValue,
        avgValue: a.avgValue,
        sumValue: a.sumValue,
        sampleCount: a.sampleCount,
      })),
    };
  }
}
