/** BullMQ queue name for CloudOps background jobs. */
export const CLOUDOPS_QUEUE_NAME = 'cloudops-jobs';

/** BullMQ queue name for notification delivery (email, etc.). */
export const NOTIFICATION_QUEUE_NAME = 'cloudops-notifications';

/** BullMQ job names (match JobType for MVP handlers). */
export const QUEUE_JOB_NAMES = {
  RESOURCE_SYNC: 'RESOURCE_SYNC',
  HEALTH_CHECK: 'HEALTH_CHECK',
  METRIC_COLLECTION: 'METRIC_COLLECTION',
  NOTIFICATION_DELIVERY: 'NOTIFICATION_DELIVERY',
} as const;


export type QueueJobName = (typeof QUEUE_JOB_NAMES)[keyof typeof QUEUE_JOB_NAMES];
