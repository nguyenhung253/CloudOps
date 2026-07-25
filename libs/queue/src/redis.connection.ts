import Redis, { type RedisOptions } from 'ioredis';

/**
 * BullMQ requires maxRetriesPerRequest: null on the shared connection.
 */
export function createRedisConnection(redisUrl?: string): Redis {
  const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
  return new Redis(url, options);
}
