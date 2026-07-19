import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
    ConfigModule.forRoot({
      isGlobal: true,
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
export class AppModule {}
