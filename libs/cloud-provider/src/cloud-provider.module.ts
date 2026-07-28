import { Module } from '@nestjs/common';
import { CloudProviderService } from './cloud-provider.service';
import { AwsStsAdapter } from './aws/aws-sts.adapter';
import { AwsEc2Adapter } from './aws/aws-ec2.adapter';
import { AwsElbv2Adapter } from './aws/aws-elbv2.adapter';
import { AwsCloudWatchAdapter } from './aws/aws-cloudwatch.adapter';

@Module({
  providers: [
    CloudProviderService,
    AwsStsAdapter,
    AwsEc2Adapter,
    AwsElbv2Adapter,
    AwsCloudWatchAdapter,
  ],
  exports: [
    CloudProviderService,
    AwsStsAdapter,
    AwsEc2Adapter,
    AwsElbv2Adapter,
    AwsCloudWatchAdapter,
  ],
})
export class CloudProviderModule {}

