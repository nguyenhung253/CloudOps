import { Module } from '@nestjs/common';
import { CloudProviderService } from './cloud-provider.service';

@Module({
  providers: [CloudProviderService],
  exports: [CloudProviderService],
})
export class CloudProviderModule {}
