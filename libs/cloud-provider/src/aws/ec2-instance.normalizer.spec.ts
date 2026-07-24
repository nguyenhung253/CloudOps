import { normalizeEc2Instance, tagsToRecord } from './ec2-instance.normalizer';
import type { Instance } from '@aws-sdk/client-ec2';

describe('ec2-instance.normalizer', () => {
  it('maps tags to a record', () => {
    expect(
      tagsToRecord([
        { Key: 'Name', Value: 'web-1' },
        { Key: 'Env', Value: 'prod' },
      ]),
    ).toEqual({ Name: 'web-1', Env: 'prod' });
  });

  it('normalizes an EC2 instance into CloudResourceSnapshot', () => {
    const instance: Instance = {
      InstanceId: 'i-0123456789abcdef0',
      InstanceType: 't3.micro',
      State: { Name: 'running', Code: 16 },
      VpcId: 'vpc-abc',
      SubnetId: 'subnet-xyz',
      PrivateIpAddress: '10.0.1.10',
      PublicIpAddress: '1.2.3.4',
      Placement: { AvailabilityZone: 'ap-southeast-1a' },
      ImageId: 'ami-123',
      Tags: [
        { Key: 'Name', Value: 'api-server' },
        { Key: 'Team', Value: 'platform' },
      ],
      SecurityGroups: [{ GroupId: 'sg-1', GroupName: 'default' }],
      LaunchTime: new Date('2024-01-01T00:00:00.000Z'),
    };

    const snapshot = normalizeEc2Instance(instance, {
      cloudAccountId: 'acc-1',
      region: 'ap-southeast-1',
    });

    expect(snapshot).toMatchObject({
      provider: 'AWS',
      cloudAccountId: 'acc-1',
      region: 'ap-southeast-1',
      resourceType: 'EC2_INSTANCE',
      providerResourceId: 'i-0123456789abcdef0',
      name: 'api-server',
      status: 'running',
      tags: { Name: 'api-server', Team: 'platform' },
    });
    expect(snapshot?.metadata).toMatchObject({
      instanceType: 't3.micro',
      vpcId: 'vpc-abc',
      subnetId: 'subnet-xyz',
      privateIpAddress: '10.0.1.10',
      publicIpAddress: '1.2.3.4',
      availabilityZone: 'ap-southeast-1a',
      imageId: 'ami-123',
      launchTime: '2024-01-01T00:00:00.000Z',
    });
  });

  it('returns null when InstanceId is missing', () => {
    expect(
      normalizeEc2Instance({} as Instance, {
        cloudAccountId: 'acc-1',
        region: 'us-east-1',
      }),
    ).toBeNull();
  });
});
