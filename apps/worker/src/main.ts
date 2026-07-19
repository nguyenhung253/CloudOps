import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);
  logger.log('[WORKER] Ready to process jobs');
}
bootstrap();
