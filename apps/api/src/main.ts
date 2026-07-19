import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor, GlobalExceptionFilter } from '@app/common';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['warn', 'error'],
  });
  app.useLogger(app.get(Logger));
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  
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

 Database    : PostgreSQL ✓
 Cache       : Redis ✓
 Queue       : BullMQ ✓

============================================================`);

  const logger = app.get(Logger);
  logger.log('CloudOps API started successfully');
}
bootstrap();
