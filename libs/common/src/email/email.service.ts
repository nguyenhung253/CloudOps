import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface SendEmailResult {
  messageId: string;
}

@Injectable()
export class EmailService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.from = this.configService.get<string>('SMTP_FROM') ?? 'noreply@cloudops.local';

    if (this.isConfigured()) {
      this.transporter = nodemailer.createTransport({
        host: this.configService.get<string>('SMTP_HOST'),
        port: Number(this.configService.get<string>('SMTP_PORT') ?? 587),
        secure: this.configService.get<string>('SMTP_SECURE') === 'true',
        auth: {
          user: this.configService.get<string>('SMTP_USER') ?? '',
          pass: this.configService.get<string>('SMTP_PASS') ?? '',
        },
      });
      this.logger.log(`SMTP transport configured (host=${this.configService.get<string>('SMTP_HOST')})`);
    } else {
      this.logger.warn('SMTP not configured — emails will not be sent. Set SMTP_HOST to enable.');
    }
  }

  /**
   * Check whether SMTP is configured via environment variables.
   */
  isConfigured(): boolean {
    const host = this.configService.get<string>('SMTP_HOST');
    return !!host && host.length > 0;
  }

  /**
   * Send an email via SMTP.
   * Throws if SMTP is not configured or if the send fails.
   */
  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    if (!this.transporter) {
      throw new SmtpNotConfiguredError(
        'SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars.',
      );
    }

    const info = await this.transporter.sendMail({
      from: this.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    this.logger.debug(`Email sent to=${options.to} subject="${options.subject}" messageId=${info.messageId}`);
    return { messageId: info.messageId };
  }

  async onModuleDestroy() {
    if (this.transporter) {
      this.transporter.close();
    }
  }
}

/**
 * Thrown when SMTP is not configured. Treated as retryable by notification worker
 * so delivery will be attempted again once SMTP is set up.
 */
export class SmtpNotConfiguredError extends Error {
  readonly code = 'SMTP_NOT_CONFIGURED';
  constructor(message: string) {
    super(message);
    this.name = 'SmtpNotConfiguredError';
  }
}
