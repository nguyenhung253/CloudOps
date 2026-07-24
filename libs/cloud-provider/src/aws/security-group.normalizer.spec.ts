import { normalizeSecurityGroup } from './security-group.normalizer';
import type { SecurityGroup } from '@aws-sdk/client-ec2';

describe('security-group.normalizer', () => {
  it('normalizes a security group', () => {
    const group: SecurityGroup = {
      GroupId: 'sg-0123456789abcdef0',
      GroupName: 'web-sg',
      Description: 'web tier',
      VpcId: 'vpc-abc',
      OwnerId: '123456789012',
      Tags: [{ Key: 'Name', Value: 'web-sg' }],
      IpPermissions: [
        {
          IpProtocol: 'tcp',
          FromPort: 443,
          ToPort: 443,
          IpRanges: [{ CidrIp: '0.0.0.0/0' }],
        },
      ],
      IpPermissionsEgress: [
        {
          IpProtocol: '-1',
          IpRanges: [{ CidrIp: '0.0.0.0/0' }],
        },
      ],
    };

    const snapshot = normalizeSecurityGroup(group, {
      cloudAccountId: 'acc-1',
      region: 'ap-southeast-1',
    });

    expect(snapshot).toMatchObject({
      provider: 'AWS',
      resourceType: 'SECURITY_GROUP',
      providerResourceId: 'sg-0123456789abcdef0',
      name: 'web-sg',
      status: 'available',
    });
    expect(snapshot?.metadata).toMatchObject({
      groupName: 'web-sg',
      vpcId: 'vpc-abc',
      ingressRuleCount: 1,
      egressRuleCount: 1,
    });
  });

  it('returns null without GroupId', () => {
    expect(
      normalizeSecurityGroup({} as SecurityGroup, {
        cloudAccountId: 'a',
        region: 'us-east-1',
      }),
    ).toBeNull();
  });
});
