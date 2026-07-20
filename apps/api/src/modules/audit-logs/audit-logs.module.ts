import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { AuditLogsService } from './audit-logs.service';

@Module({
  imports: [DatabaseModule],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
