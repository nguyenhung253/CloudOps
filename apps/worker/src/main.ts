import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);
  logger.log('[WORKER] CloudOps job worker ready (BullMQ consumer)');

  // Keep process alive; WorkerConsumer owns the Redis connection lifecycle.
  const shutdown = async (signal: string) => {
    logger.log(`[WORKER] Shutting down on ${signal}`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[WORKER] Failed to start', err);
  process.exit(1);
});
