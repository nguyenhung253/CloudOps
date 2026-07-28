import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  async dispatchIncidentNotification(
    tx: Prisma.TransactionClient,
    params: {
      incidentId: string;
      title: string;
      reason: string;
    },
  ) {
    const dedupKey = `notif:${params.incidentId}:${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    try {
      await tx.notificationDelivery.create({
        data: {
          incidentId: params.incidentId,
          channel: NotificationChannel.EMAIL,
          destination: 'oncall@cloudops.internal',
          templateCode: 'INCIDENT_ALERT_DISPATCHED',
          status: NotificationStatus.FAILED,
          deduplicationKey: dedupKey,
          lastError: 'Notification provider not configured for MVP',
          attemptCount: 1,
        },
      });
      this.logger.log(`Created NotificationDelivery (FAILED - Not Configured) for incident ${params.incidentId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to create NotificationDelivery for incident ${params.incidentId}: ${msg}`);
    }
  }
}
