import type { Job } from '@prisma/client';

export interface JobHandlerContext {
  job: Job;
  executionId: string;
  attemptNumber: number;
  updateProgress: (progress: number, message?: string) => Promise<void>;
  isCancelled: () => Promise<boolean>;
  /** AbortSignal that fires when the job exceeds its timeout. Handlers with loops must poll signal.aborted. */
  abortSignal: AbortSignal;
}

export interface JobHandlerResult {
  summary: Record<string, unknown>;
}

export interface JobHandler {
  readonly type: string;
  handle(ctx: JobHandlerContext): Promise<JobHandlerResult>;
}

export const JOB_HANDLERS = Symbol('JOB_HANDLERS');
