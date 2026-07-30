import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
