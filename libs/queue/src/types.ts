/**
 * Minimal Redis/BullMQ payload.
 * Worker loads full job state and context from PostgreSQL by jobId.
 */
export interface QueueJobPayload {
  jobId: string;
}
