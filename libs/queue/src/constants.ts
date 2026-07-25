/** BullMQ queue name for CloudOps background jobs. */
export const CLOUDOPS_QUEUE_NAME = 'cloudops-jobs';

/** BullMQ job names (match JobType for MVP handlers). */
export const QUEUE_JOB_NAMES = {
  RESOURCE_SYNC: 'RESOURCE_SYNC',
  HEALTH_CHECK: 'HEALTH_CHECK',
} as const;

export type QueueJobName = (typeof QUEUE_JOB_NAMES)[keyof typeof QUEUE_JOB_NAMES];
