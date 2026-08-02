import Redis, { type RedisOptions } from 'ioredis';

/**
 * BullMQ requires maxRetriesPerRequest: null on the shared connection.
 */
export function createRedisConnection(redisUrl?: string): Redis {
  const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times) {
      // Exponential backoff with jitter, max 30s between retries
      const delay = Math.min(500 * Math.pow(1.5, times), 30_000);
      return delay;
    },
  };
  return new Redis(url, options);
}
