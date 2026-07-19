import { join } from 'path';
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { RequestIdMiddleware } from '@app/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import queueConfig from './config/queue.config';
import { validationSchema } from './config/validation.schema';
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
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
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
        hooks: {
          logMethod(inputArgs, method) {
            const [obj] = inputArgs;
            if (obj && typeof obj === 'object' && 'context' in obj) {
              const context = obj.context;
              if (
                context === 'InstanceLoader' ||
                context === 'RoutesResolver' ||
                context === 'RouterExplorer' ||
                context === 'NestFactory' ||
                context === 'NestApplication' ||
                context === 'LegacyRouteConverter'
              ) {
                return;
              }
            }
            method.apply(this, inputArgs);
          },
        },
      },
      forRoutes: ['{*path}'],
    }),
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
