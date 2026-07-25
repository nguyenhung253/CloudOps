import { Inject, Injectable, Logger } from '@nestjs/common';
import { JobType } from '@prisma/client';
import {
  JOB_HANDLERS,
  type JobHandler,
} from './job-handler.interface';

@Injectable()
export class JobHandlerRegistry {
  private readonly logger = new Logger(JobHandlerRegistry.name);
  private readonly byType = new Map<string, JobHandler>();

  constructor(@Inject(JOB_HANDLERS) handlers: JobHandler[]) {
    for (const handler of handlers) {
      this.byType.set(handler.type, handler);
      this.logger.log(`Registered job handler: ${handler.type}`);
    }
  }

  get(type: JobType | string): JobHandler | undefined {
    return this.byType.get(type);
  }

  has(type: JobType | string): boolean {
    return this.byType.has(type);
  }
}
