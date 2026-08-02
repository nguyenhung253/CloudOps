import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

@Injectable()
export class ObservabilityService {
  constructor(private readonly logger: Logger) {}

  logInfo(message: string, context?: Record<string, unknown>) {
    this.logger.log({ ...context, message });
  }

  logWarn(message: string, context?: Record<string, unknown>) {
    this.logger.warn({ ...context, message });
  }

  logError(message: string, error?: Error, context?: Record<string, unknown>) {
    this.logger.error({
      ...context,
      message,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
    });
  }
}
