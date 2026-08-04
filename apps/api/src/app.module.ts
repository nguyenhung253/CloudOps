import { join } from 'path';
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { RequestIdMiddleware } from '@app/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import queueConfig from './config/queue.config';
import loggerConfig from './config/logger.config';
import { validationSchema } from './config/validation.schema';
import { LoggerContextMiddleware } from './middleware/logger-context.middleware';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HttpMetricsInterceptor } from './interceptors/http-metrics.interceptor';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CloudAccountsModule } from './modules/cloud-accounts/cloud-accounts.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { LogsModule } from './modules/logs/logs.module';
import { AlertRulesModule } from './modules/alert-rules/alert-rules.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EmailModule } from '@app/common';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { WorkersModule } from './modules/workers/workers.module';
import { QueuesModule } from './modules/queues/queues.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { SettingsModule } from './modules/settings/settings.module';
@Module({
  imports: [
    LoggerModule.forRoot(loggerConfig),
    ConfigModule.forRoot({
      isGlobal: true,
      // Package cwd first, then monorepo root (pnpm filter runs with apps/api as cwd)
      envFilePath: [
        join(process.cwd(), '.env'),
        join(process.cwd(), '.env.local'),
        join(process.cwd(), '../../.env'),
        join(process.cwd(), '../../.env.local'),
      ],
      load: [appConfig, authConfig, databaseConfig, queueConfig],
      validationSchema,
    }),
    HealthModule,
    EmailModule,
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
    AuthModule,
    UsersModule,
    CloudAccountsModule,
    ResourcesModule,
    JobsModule,
    MetricsModule,
    LogsModule,
    AlertRulesModule,
    AlertsModule,
    IncidentsModule,
    NotificationsModule,
    AuditLogsModule,
    DashboardModule,
    WorkersModule,
    QueuesModule,
    SchedulesModule,
    SettingsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, LoggerContextMiddleware).forRoutes('{*path}');
  }
}
