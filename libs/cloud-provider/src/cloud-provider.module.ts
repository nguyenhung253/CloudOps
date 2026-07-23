import { Module } from '@nestjs/common';
import { CloudProviderService } from './cloud-provider.service';
import { AwsStsAdapter } from './aws/aws-sts.adapter';
import { AwsEc2Adapter } from './aws/aws-ec2.adapter';

@Module({
  providers: [CloudProviderService, AwsStsAdapter, AwsEc2Adapter],
  exports: [CloudProviderService, AwsStsAdapter, AwsEc2Adapter],
})
export class CloudProviderModule {}
