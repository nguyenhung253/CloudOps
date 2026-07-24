import { normalizeApplicationLoadBalancer } from './alb.normalizer';
import type { LoadBalancer } from '@aws-sdk/client-elastic-load-balancing-v2';

describe('alb.normalizer', () => {
  it('normalizes an Application Load Balancer', () => {
    const lb: LoadBalancer = {
      LoadBalancerArn:
        'arn:aws:elasticloadbalancing:ap-southeast-1:123456789012:loadbalancer/app/my-alb/50dc6c495c0c9188',
      LoadBalancerName: 'my-alb',
      DNSName: 'my-alb-1234567890.ap-southeast-1.elb.amazonaws.com',
      CanonicalHostedZoneId: 'Z1LMS91P8CMLE5',
      CreatedTime: new Date('2024-06-01T00:00:00.000Z'),
      Scheme: 'internet-facing',
      VpcId: 'vpc-abc',
      State: { Code: 'active' },
      Type: 'application',
      IpAddressType: 'ipv4',
      SecurityGroups: ['sg-1', 'sg-2'],
      AvailabilityZones: [
        {
          ZoneName: 'ap-southeast-1a',
          SubnetId: 'subnet-1',
        },
      ],
    };

    const snapshot = normalizeApplicationLoadBalancer(lb, {
      cloudAccountId: 'acc-1',
      region: 'ap-southeast-1',
      tags: [
        { Key: 'Name', Value: 'public-alb' },
        { Key: 'Env', Value: 'prod' },
      ],
    });

    expect(snapshot).toMatchObject({
      provider: 'AWS',
      resourceType: 'APPLICATION_LOAD_BALANCER',
      providerResourceId: lb.LoadBalancerArn,
      name: 'public-alb',
      status: 'active',
      tags: { Name: 'public-alb', Env: 'prod' },
    });
    expect(snapshot?.metadata).toMatchObject({
      loadBalancerName: 'my-alb',
      dnsName: 'my-alb-1234567890.ap-southeast-1.elb.amazonaws.com',
      scheme: 'internet-facing',
      vpcId: 'vpc-abc',
      type: 'application',
    });
  });

  it('returns null without LoadBalancerArn', () => {
    expect(
      normalizeApplicationLoadBalancer({} as LoadBalancer, {
        cloudAccountId: 'a',
        region: 'us-east-1',
      }),
    ).toBeNull();
  });
});
