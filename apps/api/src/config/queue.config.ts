import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
}));
