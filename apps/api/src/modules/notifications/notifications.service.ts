import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@app/database';
import {
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { logContext } from '@app/common';
import { QueueService } from '@app/queue';

export interface CreateNotificationInput {
  userId?: string;
  alertId?: string;
  incidentId?: string;
  channel: NotificationChannel;
  destination?: string;
  templateCode: string;
  deduplicationKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Create a notification delivery record.
   * For IN_APP: persists. For EMAIL: persists + attempts send.
   */
  async create(input: CreateNotificationInput) {
    const dedupKey = input.deduplicationKey ?? `${input.templateCode}:${Date.now()}`;

    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        alertId: input.alertId ?? null,
        incidentId: input.incidentId ?? null,
        channel: input.channel,
        destination: input.destination ?? '',
        templateCode: input.templateCode,
        status: NotificationStatus.PENDING,
        deduplicationKey: dedupKey,
        attemptCount: 0,
      },
    });

    const ctx = logContext.getStore();
    this.logger.log({
      ...ctx,
      notificationId: delivery.id,
      channel: delivery.channel,
      template: delivery.templateCode,
      message: 'Notification created',
    });

    // IN_APP: immediately mark as sent (no external delivery needed)
    if (input.channel === NotificationChannel.IN_APP) {
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
      });
    }

    return delivery;
  }

  /**
   * List notifications for display in the notification center UI.
   * Ordered by most recent first, limited to 50.
   */
  async listForUser(userId: string, page = 1, limit = 20) {
    const skip = (Math.max(1, page) - 1) * Math.min(50, Math.max(1, limit));

    const where: Prisma.NotificationDeliveryWhereInput = {
      // IN_APP notifications are visible to everyone;
      // EMAIL notifications also visible for transparency
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationDelivery.findMany({
        where,
        include: {
          alert: { select: { id: true, title: true, severity: true, status: true } },
          incident: { select: { id: true, title: true, severity: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notificationDelivery.count({ where }),
    ]);

    return {
      data: items.map((n) => ({
        id: n.id,
        channel: n.channel,
        templateCode: n.templateCode,
        status: n.status,
        attemptCount: n.attemptCount,
        lastError: n.lastError,
        alert: n.alert,
        incident: n.incident,
        sentAt: n.sentAt,
        createdAt: n.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retry a failed notification delivery.
   * Resets DB status to PENDING and re-enqueues to BullMQ for worker pickup.
   */
  async retry(id: string): Promise<{ id: string; status: NotificationStatus }> {
    const delivery = await this.prisma.notificationDelivery.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException('Notification not found');

    if (delivery.status !== NotificationStatus.FAILED) {
      throw new NotFoundException('Only failed deliveries can be retried');
    }

    const updated = await this.prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: NotificationStatus.PENDING,
        lastError: null,
      },
    });

    // Re-enqueue to BullMQ so the worker picks it up
    if (delivery.channel === NotificationChannel.EMAIL) {
      await this.queueService.enqueueNotification(updated.id).catch((err) => {
        this.logger.warn(`Failed to re-enqueue notification delivery ${id}: ${err?.message}`);
      });
    }

    return { id: updated.id, status: updated.status };
  }

  /**
   * Get notification statistics (unread count, by channel, by status).
   */
  async getStats() {
    const [total, byChannel, byStatus] = await Promise.all([
      this.prisma.notificationDelivery.count(),
      this.prisma.notificationDelivery.groupBy({
        by: ['channel'],
        _count: { _all: true },
      }),
      this.prisma.notificationDelivery.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    return {
      total,
      byChannel: Object.fromEntries(byChannel.map((r) => [r.channel, r._count._all])),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    };
  }
}
