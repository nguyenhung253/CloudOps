import type { LoadBalancer, Tag } from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  CloudResourceSnapshot,
  RESOURCE_TYPES,
} from '../types/cloud-resource.types';

function elbv2TagsToRecord(tags: Tag[] | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!tags) {
    return result;
  }
  for (const tag of tags) {
    if (tag.Key) {
      result[tag.Key] = tag.Value ?? '';
    }
  }
  return result;
}

/**
 * Normalize an AWS Application Load Balancer into the shared snapshot model.
 * Only Type=application should be passed in by the adapter.
 */
export function normalizeApplicationLoadBalancer(
  lb: LoadBalancer,
  params: {
    cloudAccountId: string;
    region: string;
    tags?: Tag[];
  },
): CloudResourceSnapshot | null {
  if (!lb.LoadBalancerArn) {
    return null;
  }

  const tags = elbv2TagsToRecord(params.tags);
  const name = tags.Name || lb.LoadBalancerName || undefined;

  return {
    provider: 'AWS',
    cloudAccountId: params.cloudAccountId,
    region: params.region,
    resourceType: RESOURCE_TYPES.APPLICATION_LOAD_BALANCER,
    providerResourceId: lb.LoadBalancerArn,
    name,
    status: lb.State?.Code,
    tags,
    metadata: {
      loadBalancerName: lb.LoadBalancerName ?? null,
      loadBalancerArn: lb.LoadBalancerArn,
      dnsName: lb.DNSName ?? null,
      canonicalHostedZoneId: lb.CanonicalHostedZoneId ?? null,
      createdTime: lb.CreatedTime?.toISOString() ?? null,
      scheme: lb.Scheme ?? null,
      vpcId: lb.VpcId ?? null,
      type: lb.Type ?? null,
      ipAddressType: lb.IpAddressType ?? null,
      stateReason: lb.State?.Reason ?? null,
      securityGroups: lb.SecurityGroups ?? [],
      availabilityZones: (lb.AvailabilityZones ?? []).map((az) => ({
        zoneName: az.ZoneName ?? null,
        subnetId: az.SubnetId ?? null,
        loadBalancerAddresses: (az.LoadBalancerAddresses ?? []).map((addr) => ({
          ipAddress: addr.IpAddress ?? null,
          allocationId: addr.AllocationId ?? null,
          privateIPv4Address: addr.PrivateIPv4Address ?? null,
          iPv6Address: addr.IPv6Address ?? null,
        })),
      })),
      customerOwnedIpv4Pool: lb.CustomerOwnedIpv4Pool ?? null,
      enforceSecurityGroupInboundRulesOnPrivateLinkTraffic:
        lb.EnforceSecurityGroupInboundRulesOnPrivateLinkTraffic ?? null,
    },
  };
}

export function normalizeApplicationLoadBalancers(
  items: Array<{ lb: LoadBalancer; tags?: Tag[] }>,
  params: { cloudAccountId: string; region: string },
): CloudResourceSnapshot[] {
  const snapshots: CloudResourceSnapshot[] = [];
  for (const item of items) {
    const snapshot = normalizeApplicationLoadBalancer(item.lb, {
      ...params,
      tags: item.tags,
    });
    if (snapshot) {
      snapshots.push(snapshot);
    }
  }
  return snapshots;
}
