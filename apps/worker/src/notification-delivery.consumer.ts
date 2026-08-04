import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker, type Job as BullJob } from 'bullmq';
import type Redis from 'ioredis';
import { PrismaService } from '@app/database';
import {
  NOTIFICATION_QUEUE_NAME,
  createRedisConnection,
  type NotificationDeliveryPayload,
} from '@app/queue';
import { EmailService, SmtpNotConfiguredError } from '@app/common';
import { NotificationChannel, NotificationStatus } from '@prisma/client';

@Injectable()
export class NotificationDeliveryConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDeliveryConsumer.name);
  private connection: Redis | null = null;
  private worker: Worker<NotificationDeliveryPayload> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit() {
    this.connection = createRedisConnection();
    const concurrency = Number(process.env.NOTIFICATION_WORKER_CONCURRENCY || 3);

    this.worker = new Worker<NotificationDeliveryPayload>(
      NOTIFICATION_QUEUE_NAME,
      async (bullJob: BullJob<NotificationDeliveryPayload>) => {
        const { deliveryId } = bullJob.data;
        if (!deliveryId) {
          this.logger.error(`Notification bull job ${bullJob.id} missing deliveryId`);
          return;
        }

        this.logger.log(
          `Processing notification delivery deliveryId=${deliveryId} attempt=${bullJob.attemptsMade + 1}`,
        );

        await this.processDelivery(deliveryId);
      },
      {
        connection: this.connection,
        concurrency,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`Notification delivery completed bullId=${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.warn(
        `Notification delivery failed bullId=${job?.id} deliveryId=${job?.data?.deliveryId} err=${err?.message}`,
      );
    });

    this.worker.on('error', (err) => {
      this.logger.error(`Notification worker error: ${err.message}`);
    });

    this.logger.log(
      `Notification delivery worker listening on queue=${NOTIFICATION_QUEUE_NAME} concurrency=${concurrency}`,
    );
  }

  /**
   * Process a single notification delivery:
   * 1. Load delivery + notification from DB
   * 2. Skip if already SENT or not EMAIL
   * 3. Mark SENDING
   * 4. Send email via EmailService
   * 5. Mark SENT or throw for BullMQ retry
   */
  private async processDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        notification: true,
      },
    });

    if (!delivery) {
      this.logger.warn(`Delivery ${deliveryId} not found in DB — skipping`);
      return;
    }

    // Already processed — idempotent skip
    if (delivery.status === NotificationStatus.SENT) {
      this.logger.debug(`Delivery ${deliveryId} already SENT — skipping`);
      return;
    }

    // Only handle EMAIL deliveries
    if (delivery.channel !== NotificationChannel.EMAIL) {
      this.logger.debug(`Delivery ${deliveryId} is ${delivery.channel} — skipping`);
      return;
    }

    // Mark as SENDING
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: NotificationStatus.SENDING },
    });

    try {
      const notification = delivery.notification;
      const subject = notification
        ? `[CloudOps] ${notification.severity}: ${notification.title}`
        : `[CloudOps] Notification`;

      const htmlBody = this.buildEmailHtml(notification, delivery);
      const textBody = this.buildEmailText(notification, delivery);

      const result = await this.emailService.send({
        to: delivery.destination,
        subject,
        html: htmlBody,
        text: textBody,
      });

      // Success: mark SENT
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          providerMessageId: result.messageId,
          attemptCount: { increment: 1 },
        },
      });

      this.logger.log(
        `Email sent for delivery ${deliveryId} to=${delivery.destination} messageId=${result.messageId}`,
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isSmtpNotConfigured = err instanceof SmtpNotConfiguredError;

      // Update delivery with error info
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: NotificationStatus.FAILED,
          attemptCount: { increment: 1 },
          lastError: errorMessage,
        },
      });

      this.logger.warn(
        `Email delivery failed deliveryId=${deliveryId} to=${delivery.destination} err=${errorMessage}`,
      );

      // Throw to trigger BullMQ retry (with backoff)
      // SmtpNotConfigured is also retryable — delivery will succeed once SMTP is configured
      throw err;
    }
  }

  private buildEmailHtml(
    notification: { severity: string; title: string; message: string; source: string; type: string } | null,
    delivery: { destination: string; templateCode: string },
  ): string {
    if (!notification) {
      return `<p>A notification was triggered. Template: ${delivery.templateCode}</p>`;
    }

    const severityColor =
      notification.severity === 'CRITICAL' ? '#e74c3c' :
      notification.severity === 'WARNING' ? '#f39c12' : '#3498db';

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 24px; border-radius: 8px 8px 0 0;">
          <h2 style="color: #e26f54; margin: 0; font-size: 20px;">☁️ CloudOps</h2>
        </div>
        <div style="background: #16213e; padding: 24px; border-left: 4px solid ${severityColor};">
          <div style="display: inline-block; background: ${severityColor}; color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-bottom: 12px;">
            ${notification.severity}
          </div>
          <h3 style="color: #eee; margin: 8px 0;">${notification.title}</h3>
          <p style="color: #aaa; margin: 8px 0; line-height: 1.5;">${notification.message}</p>
          <hr style="border: none; border-top: 1px solid #2a2a4a; margin: 16px 0;">
          <table style="color: #888; font-size: 13px;">
            <tr><td style="padding: 2px 12px 2px 0; color: #666;">Source</td><td>${notification.source}</td></tr>
            <tr><td style="padding: 2px 12px 2px 0; color: #666;">Type</td><td>${notification.type}</td></tr>
            <tr><td style="padding: 2px 12px 2px 0; color: #666;">Time</td><td>${new Date().toISOString()}</td></tr>
          </table>
        </div>
        <div style="background: #0f3460; padding: 16px 24px; border-radius: 0 0 8px 8px;">
          <p style="color: #666; font-size: 12px; margin: 0;">
            You received this because your notification preferences have email enabled for ${notification.source} events.
          </p>
        </div>
      </div>
    `;
  }

  private buildEmailText(
    notification: { severity: string; title: string; message: string; source: string; type: string } | null,
    delivery: { destination: string; templateCode: string },
  ): string {
    if (!notification) {
      return `CloudOps Notification — Template: ${delivery.templateCode}`;
    }

    return [
      `[CloudOps] ${notification.severity}: ${notification.title}`,
      '',
      notification.message,
      '',
      `Source: ${notification.source}`,
      `Type: ${notification.type}`,
      `Time: ${new Date().toISOString()}`,
      '',
      `— CloudOps Notification System`,
    ].join('\n');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.pause();
      await this.worker.close();
      this.logger.log('Notification delivery worker closed gracefully.');
    }
    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
  }
}
