/**
 * Minimal Redis/BullMQ payload.
 * Worker loads full job state and context from PostgreSQL by jobId.
 */
export interface QueueJobPayload {
  jobId: string;
}

/**
 * BullMQ payload for notification delivery jobs.
 * Worker loads full delivery state from PostgreSQL by deliveryId.
 */
export interface NotificationDeliveryPayload {
  deliveryId: string;
}
