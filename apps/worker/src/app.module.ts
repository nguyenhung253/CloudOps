import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from '@app/database';
import { CloudProviderModule } from '@app/cloud-provider';
import { ResourcesService } from '@api/resources/resources.service';
import { AuditLogsService } from '@api/audit-logs/audit-logs.service';
import { JobLifecycleService } from './job-lifecycle.service';
import { JobProcessorService } from './job-processor.service';
import { WorkerConsumer } from './worker.consumer';
import { WorkerHeartbeatService } from './worker-heartbeat.service';
import { JobHandlerRegistry } from './handlers/job-handler.registry';
import { JOB_HANDLERS } from './handlers/job-handler.interface';
import { ResourceSyncHandler } from './handlers/resource-sync.handler';
import { HealthCheckHandler } from './handlers/health-check.handler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), '.env'),
        join(process.cwd(), '.env.local'),
        join(process.cwd(), '../../.env'),
        join(process.cwd(), '../../.env.local'),
      ],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: false,
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  translateTime: 'HH:MM:ss',
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
      },
    }),
    DatabaseModule,
    CloudProviderModule,
  ],
  providers: [
    AuditLogsService,
    ResourcesService,
    JobLifecycleService,
    WorkerHeartbeatService,
    ResourceSyncHandler,
    HealthCheckHandler,
    {
      provide: JOB_HANDLERS,
      useFactory: (
        resourceSync: ResourceSyncHandler,
        healthCheck: HealthCheckHandler,
      ) => [resourceSync, healthCheck],
      inject: [ResourceSyncHandler, HealthCheckHandler],
    },
    JobHandlerRegistry,
    JobProcessorService,
    WorkerConsumer,
  ],
})
export class AppModule {}
