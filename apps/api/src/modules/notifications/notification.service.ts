import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/database';
import {
  NotificationSource,
  NotificationReadStatus,
  NotificationChannel,
  NotificationStatus,
  AlertSeverity,
  Prisma,
} from '@prisma/client';

export interface CreateNotificationInput {
  type: string;
  source: NotificationSource;
  severity: AlertSeverity;
  title: string;
  message: string;
  resourceId?: string;
  incidentId?: string;
  jobId?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Create a notification event and dispatch to configured channels.
   * Called by other services (IncidentService, JobsService, etc.) when
   * important events occur.
   */
  async create(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: {
        type: input.type,
        source: input.source,
        severity: input.severity,
        title: input.title,
        message: input.message,
        resourceId: input.resourceId ?? null,
        incidentId: input.incidentId ?? null,
        jobId: input.jobId ?? null,
        readStatus: NotificationReadStatus.UNREAD,
      },
    });

    // Dispatch to channels based on user preferences
    await this.dispatchToChannels(notification);

    this.logger.log({
      notificationId: notification.id,
      type: notification.type,
      severity: notification.severity,
      message: 'Notification created and dispatched',
    });

    return notification;
  }

  /**
   * Dispatch a notification to enabled channels for all users
   * who have preferences allowing this source.
   */
  private async dispatchToChannels(
    notification: Awaited<ReturnType<typeof this.prisma.notification.create>>,
  ) {
    // Get all users who have preferences for this source
    const preferences = await this.prisma.notificationPreference.findMany({
      where: {
        source: notification.source,
        enabled: true,
      },
      include: { user: { select: { email: true } } },
    });

    for (const pref of preferences) {
      const dedupKey = `notif:${notification.id}:${pref.userId}:${pref.channel}`;

      try {
        if (pref.channel === NotificationChannel.IN_APP) {
          // In-app: mark as sent immediately (no external delivery)
          await this.prisma.notificationDelivery.create({
            data: {
              notificationId: notification.id,
              channel: NotificationChannel.IN_APP,
              destination: pref.userId,
              templateCode: notification.type,
              status: NotificationStatus.SENT,
              deduplicationKey: dedupKey,
              sentAt: new Date(),
            },
          });
        } else if (pref.channel === NotificationChannel.EMAIL) {
          // Email: create pending delivery (worker picks up later)
          await this.prisma.notificationDelivery.create({
            data: {
              notificationId: notification.id,
              channel: NotificationChannel.EMAIL,
              destination: pref.user.email,
              templateCode: notification.type,
              status: NotificationStatus.PENDING,
              deduplicationKey: dedupKey,
            },
          });
        }
      } catch (err: any) {
        // Dedup key collision or other transient error — skip this delivery
        if (err?.code !== 'P2002') {
          this.logger.warn({
            notificationId: notification.id,
            userId: pref.userId,
            channel: pref.channel,
            error: err?.message,
            message: 'Failed to create notification delivery',
          });
        }
      }
    }
  }

  /**
   * List notifications for the UI notification center.
   * Ordered by most recent first.
   */
  async list(options: {
    source?: NotificationSource;
    severity?: AlertSeverity;
    readStatus?: NotificationReadStatus;
    page?: number;
    limit?: number;
  } = {}) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(50, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {};
    if (options.source) where.source = options.source;
    if (options.severity) where.severity = options.severity;
    if (options.readStatus !== undefined) where.readStatus = options.readStatus;

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: {
          resource: { select: { id: true, name: true, resourceType: true } },
          incident: { select: { id: true, incidentNumber: true, title: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { readStatus: NotificationReadStatus.UNREAD },
      }),
    ]);

    return {
      data: items.map((n) => ({
        id: n.id,
        type: n.type,
        source: n.source,
        severity: n.severity,
        title: n.title,
        message: n.message,
        readStatus: n.readStatus,
        resource: n.resource,
        incident: n.incident,
        createdAt: n.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        unreadCount,
      },
    };
  }

  /** Mark a notification as read. Idempotent. */
  async markRead(id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, readStatus: NotificationReadStatus.UNREAD },
      data: { readStatus: NotificationReadStatus.READ },
    });
  }

  /** Mark all notifications as read. */
  async markAllRead(): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { readStatus: NotificationReadStatus.UNREAD },
      data: { readStatus: NotificationReadStatus.READ },
    });
  }

  /** Get unread count for the bell badge. */
  async unreadCount(): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { readStatus: NotificationReadStatus.UNREAD },
    });
    return { count };
  }

  /* ------------------------------------------------------------------ */
  /*  Preferences                                                        */
  /* ------------------------------------------------------------------ */

  /** Get notification preferences for a user. */
  async getPreferences(userId: string) {
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { source: 'asc' },
    });

    // Return defaults for sources without explicit preferences
    const sources = Object.values(NotificationSource);
    return sources.map((source) => {
      const sourcePrefs = prefs.filter((p) => p.source === source);
      const email = sourcePrefs.find((p) => p.channel === NotificationChannel.EMAIL);
      const inApp = sourcePrefs.find((p) => p.channel === NotificationChannel.IN_APP);

      return {
        source,
        channels: {
          EMAIL: email?.enabled ?? (source === NotificationSource.INCIDENT),
          IN_APP: inApp?.enabled ?? true,
        },
      };
    });
  }

  /** Upsert a notification preference for a user. */
  async setPreference(
    userId: string,
    source: NotificationSource,
    channel: NotificationChannel,
    enabled: boolean,
  ) {
    return this.prisma.notificationPreference.upsert({
      where: {
        userId_source_channel: { userId, source, channel },
      },
      create: { userId, source, channel, enabled },
      update: { enabled },
    });
  }

  /** Get delivery status for a notification. */
  async getDeliveries(notificationId: string) {
    return this.prisma.notificationDelivery.findMany({
      where: { notificationId },
      select: {
        id: true,
        channel: true,
        status: true,
        attemptCount: true,
        lastError: true,
        sentAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
