import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationReadStatus,
  NotificationSource,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { QueueService } from '@app/queue';
import * as crypto from 'crypto';

@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(private readonly queueService: QueueService) {}

  /**
   * Dispatch an incident notification:
   * 1. Create Notification record (for in-app notification center)
   * 2. Create NotificationDelivery record (EMAIL, PENDING)
   * 3. Enqueue to BullMQ for worker pickup
   */
  async dispatchIncidentNotification(
    tx: Prisma.TransactionClient,
    params: {
      incidentId: string;
      title: string;
      reason: string;
    },
  ) {
    const dedupSuffix = crypto.randomBytes(4).toString('hex');

    try {
      // 1. Create Notification record (visible in notification center)
      const notification = await tx.notification.create({
        data: {
          type: 'INCIDENT_AUTO_CREATED',
          source: NotificationSource.INCIDENT,
          severity: 'CRITICAL',
          title: params.title,
          message: params.reason,
          incidentId: params.incidentId,
          readStatus: NotificationReadStatus.UNREAD,
        },
      });

      // 2. Create email delivery record (PENDING — worker will pick up)
      const dedupKey = `notif:${params.incidentId}:${Date.now()}_${dedupSuffix}`;
      const delivery = await tx.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          incidentId: params.incidentId,
          channel: NotificationChannel.EMAIL,
          destination: 'oncall@cloudops.internal',
          templateCode: 'INCIDENT_ALERT_DISPATCHED',
          status: NotificationStatus.PENDING,
          deduplicationKey: dedupKey,
          attemptCount: 0,
        },
      });

      this.logger.log(
        `Created Notification + NotificationDelivery (PENDING) for incident ${params.incidentId}`,
      );

      // 3. Enqueue to BullMQ (outside transaction — best-effort)
      // We use setImmediate to ensure this runs after the transaction commits
      setImmediate(async () => {
        try {
          await this.queueService.enqueueNotification(delivery.id);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Failed to enqueue notification delivery ${delivery.id}: ${msg}`,
          );
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to create NotificationDelivery for incident ${params.incidentId}: ${msg}`,
      );
    }
  }
}
