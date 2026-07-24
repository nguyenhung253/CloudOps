import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { CloudProviderModule } from '@app/cloud-provider';
import { ResourcesService } from './resources.service';
import { ResourcesController } from './resources.controller';
import { ResourceSyncController } from './resource-sync.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [DatabaseModule, CloudProviderModule, AuditLogsModule],
  controllers: [ResourcesController, ResourceSyncController],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
