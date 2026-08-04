// Fix BigInt JSON serialization issue globally
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ResponseInterceptor, GlobalExceptionFilter } from '@app/common';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '@app/database';
import Redis from 'ioredis';
import { helmetConfig, corsConfig } from './config/security.config';
import { HttpMetricsInterceptor } from './interceptors/http-metrics.interceptor';

async function checkDatabase(app: any): Promise<boolean> {
  try {
    const prisma = app.get(PrismaService);
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (e) {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 0,
    connectTimeout: 1000,
  });
  redis.on('error', () => {}); // Prevent unhandled error event crash
  try {
    await redis.ping();
    return true;
  } catch (e) {
    return false;
  } finally {
    redis.disconnect();
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['warn', 'error'],
  });
  app.useLogger(app.get(Logger));
  app.use(helmetConfig);
  app.enableCors(corsConfig);
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'api/docs', 'api/docs/(.*)', 'api/docs-json'],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('CloudOps Platform API')
    .setDescription('Cloud Infrastructure Monitoring & Operations API System')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  const dbConnected = await checkDatabase(app);
  const redisConnected = await checkRedis();

  console.log(`
============================================================
                    CloudOps Platform
        Cloud Infrastructure Monitoring & Operations
============================================================

 Environment : ${process.env.NODE_ENV ?? 'development'}
 Version     : 1.0.0

 API         : http://localhost:${port}
 Swagger     : http://localhost:${port}/api/docs
 Web         : http://localhost:8000

 Database    : PostgreSQL ${dbConnected ? '✓' : '✗'}
 Cache       : Redis ${redisConnected ? '✓' : '✗'}
 Queue       : BullMQ ${redisConnected ? '✓' : '✗'}

============================================================`);

  const logger = app.get(Logger);
  logger.log('CloudOps API started successfully with Swagger UI at /api/docs');
}
bootstrap();
