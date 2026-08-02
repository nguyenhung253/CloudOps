import { AsyncLocalStorage } from 'async_hooks';

export interface LogContextFields {
  requestId?: string;
  jobId?: string;
  executionId?: string;
  cloudAccountId?: string;
  userId?: string;
}

/**
 * Thread-local storage for log correlation context.
 *
 * Set by LoggerContextMiddleware per-request, and optionally enriched
 * by services with jobId, cloudAccountId, etc. during processing.
 *
 * Usage in services:
 *   import { logContext } from '@app/common';
 *   const ctx = logContext.get();
 *   this.logger.log({ ...ctx, message: 'Processing job' });
 */
export const logContext = new AsyncLocalStorage<LogContextFields>();

/**
 * Runs a callback within a specific log context.
 * Use this in worker handlers or scheduled jobs (no HTTP request).
 */
export function runWithLogContext<T>(fields: LogContextFields, fn: () => T): T {
  return logContext.run(fields, fn);
}
