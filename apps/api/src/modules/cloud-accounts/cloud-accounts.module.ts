import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { CloudProviderModule } from '@app/cloud-provider';
import { CloudAccountsService } from './cloud-accounts.service';
import { CloudAccountsController } from './cloud-accounts.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [DatabaseModule, CloudProviderModule, AuditLogsModule],
  controllers: [CloudAccountsController],
  providers: [CloudAccountsService],
  exports: [CloudAccountsService],
})
export class CloudAccountsModule {}
