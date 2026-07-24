import type { IpPermission, SecurityGroup } from '@aws-sdk/client-ec2';
import {
  CloudResourceSnapshot,
  RESOURCE_TYPES,
} from '../types/cloud-resource.types';
import { tagsToRecord } from './aws-tags.util';

function normalizeIpPermission(permission: IpPermission) {
  return {
    ipProtocol: permission.IpProtocol ?? null,
    fromPort: permission.FromPort ?? null,
    toPort: permission.ToPort ?? null,
    ipRanges: (permission.IpRanges ?? []).map((r) => ({
      cidrIp: r.CidrIp ?? null,
      description: r.Description ?? null,
    })),
    ipv6Ranges: (permission.Ipv6Ranges ?? []).map((r) => ({
      cidrIpv6: r.CidrIpv6 ?? null,
      description: r.Description ?? null,
    })),
    prefixListIds: (permission.PrefixListIds ?? []).map((p) => ({
      prefixListId: p.PrefixListId ?? null,
      description: p.Description ?? null,
    })),
    userIdGroupPairs: (permission.UserIdGroupPairs ?? []).map((p) => ({
      groupId: p.GroupId ?? null,
      groupName: p.GroupName ?? null,
      userId: p.UserId ?? null,
      vpcId: p.VpcId ?? null,
      description: p.Description ?? null,
    })),
  };
}

/**
 * Normalize an AWS Security Group into the shared CloudResourceSnapshot model.
 */
export function normalizeSecurityGroup(
  group: SecurityGroup,
  params: { cloudAccountId: string; region: string },
): CloudResourceSnapshot | null {
  if (!group.GroupId) {
    return null;
  }

  const tags = tagsToRecord(group.Tags);
  const name = tags.Name || group.GroupName || undefined;

  return {
    provider: 'AWS',
    cloudAccountId: params.cloudAccountId,
    region: params.region,
    resourceType: RESOURCE_TYPES.SECURITY_GROUP,
    providerResourceId: group.GroupId,
    name,
    status: 'available',
    tags,
    metadata: {
      groupName: group.GroupName ?? null,
      description: group.Description ?? null,
      vpcId: group.VpcId ?? null,
      ownerId: group.OwnerId ?? null,
      ingressRules: (group.IpPermissions ?? []).map(normalizeIpPermission),
      egressRules: (group.IpPermissionsEgress ?? []).map(normalizeIpPermission),
      ingressRuleCount: group.IpPermissions?.length ?? 0,
      egressRuleCount: group.IpPermissionsEgress?.length ?? 0,
    },
  };
}

export function normalizeSecurityGroups(
  groups: SecurityGroup[],
  params: { cloudAccountId: string; region: string },
): CloudResourceSnapshot[] {
  const snapshots: CloudResourceSnapshot[] = [];
  for (const group of groups) {
    const snapshot = normalizeSecurityGroup(group, params);
    if (snapshot) {
      snapshots.push(snapshot);
    }
  }
  return snapshots;
}
