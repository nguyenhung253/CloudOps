import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
