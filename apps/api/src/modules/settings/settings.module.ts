import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { CloudProviderModule } from '@app/cloud-provider';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [DatabaseModule, CloudProviderModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
