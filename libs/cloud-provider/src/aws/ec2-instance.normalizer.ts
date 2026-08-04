import type { Instance } from '@aws-sdk/client-ec2';
import {
  CloudResourceSnapshot,
  RESOURCE_TYPES,
} from '../types/cloud-resource.types';
import { tagsToRecord } from './aws-tags.util';

export { tagsToRecord } from './aws-tags.util';

/**
 * Instance type → memory in MiB.
 * Covers common t3/t2/m5/c5 families. Extended on demand.
 */
const INSTANCE_MEMORY_MIB: Record<string, number> = {
  't3.nano': 512,
  't3.micro': 1024,
  't3.small': 2048,
  't3.medium': 4096,
  't3.large': 8192,
  't3.xlarge': 16384,
  't3.2xlarge': 32768,
  't2.nano': 512,
  't2.micro': 1024,
  't2.small': 2048,
  't2.medium': 4096,
  't2.large': 8192,
  't2.xlarge': 16384,
  't2.2xlarge': 32768,
  'm5.large': 8192,
  'm5.xlarge': 16384,
  'm5.2xlarge': 32768,
  'm5.4xlarge': 65536,
  'c5.large': 4096,
  'c5.xlarge': 8192,
  'c5.2xlarge': 16384,
  'c5.4xlarge': 32768,
  'm6i.large': 8192,
  'm6i.xlarge': 16384,
  'm6i.2xlarge': 32768,
  'c6i.large': 4096,
  'c6i.xlarge': 8192,
  'c6i.2xlarge': 16384,
  't4g.nano': 512,
  't4g.micro': 1024,
  't4g.small': 2048,
  't4g.medium': 4096,
};

function lookupMemory(instanceType?: string | null): number | null {
  if (!instanceType) return null;
  const exact = INSTANCE_MEMORY_MIB[instanceType];
  if (exact !== undefined) return exact;
  // Fuzzy match: strip trailing variants like "t3.medium.search"
  const base = instanceType.split('.').slice(0, 3).join('.');
  return INSTANCE_MEMORY_MIB[base] ?? null;
}

/**
 * Default root EBS volume size in GB.
 * Real values depend on AMI/launch config — this is a reasonable
 * display default when CloudWatch Agent is not installed.
 */
const INSTANCE_DEFAULT_DISK_GB: Record<string, number> = {
  't3.nano': 8, 't3.micro': 8, 't3.small': 8, 't3.medium': 8, 't3.large': 8,
  't2.nano': 8, 't2.micro': 8, 't2.small': 8, 't2.medium': 8, 't2.large': 8,
  'm5.large': 30, 'm5.xlarge': 30, 'm5.2xlarge': 30,
  'c5.large': 30, 'c5.xlarge': 30, 'c5.2xlarge': 30,
};

function lookupDiskGb(instanceType?: string | null): number | null {
  if (!instanceType) return null;
  const exact = INSTANCE_DEFAULT_DISK_GB[instanceType];
  if (exact !== undefined) return exact;
  const base = instanceType.split('.').slice(0, 3).join('.');
  return INSTANCE_DEFAULT_DISK_GB[base] ?? 8;
}

/**
 * Normalize a single AWS EC2 Instance into the shared CloudResourceSnapshot model.
 */
export function normalizeEc2Instance(
  instance: Instance,
  params: { cloudAccountId: string; region: string },
): CloudResourceSnapshot | null {
  if (!instance.InstanceId) {
    return null;
  }

  const tags = tagsToRecord(instance.Tags);
  const name = tags.Name || undefined;

  return {
    provider: 'AWS',
    cloudAccountId: params.cloudAccountId,
    region: params.region,
    resourceType: RESOURCE_TYPES.EC2_INSTANCE,
    providerResourceId: instance.InstanceId,
    name,
    status: instance.State?.Name,
    tags,
    metadata: {
      instanceType: instance.InstanceType ?? null,
      memoryMib: lookupMemory(instance.InstanceType),
      diskTotalGb: lookupDiskGb(instance.InstanceType),
      stateCode: instance.State?.Code ?? null,
      stateReason: instance.StateReason?.Message ?? null,
      vpcId: instance.VpcId ?? null,
      subnetId: instance.SubnetId ?? null,
      privateIpAddress: instance.PrivateIpAddress ?? null,
      publicIpAddress: instance.PublicIpAddress ?? null,
      privateDnsName: instance.PrivateDnsName ?? null,
      publicDnsName: instance.PublicDnsName ?? null,
      availabilityZone: instance.Placement?.AvailabilityZone ?? null,
      tenancy: instance.Placement?.Tenancy ?? null,
      imageId: instance.ImageId ?? null,
      keyName: instance.KeyName ?? null,
      architecture: instance.Architecture ?? null,
      platform: instance.Platform ?? null,
      platformDetails: instance.PlatformDetails ?? null,
      launchTime: instance.LaunchTime?.toISOString() ?? null,
      securityGroups: (instance.SecurityGroups ?? []).map((sg) => ({
        groupId: sg.GroupId ?? null,
        groupName: sg.GroupName ?? null,
      })),
      iamInstanceProfileArn: instance.IamInstanceProfile?.Arn ?? null,
      monitoringState: instance.Monitoring?.State ?? null,
      ebsOptimized: instance.EbsOptimized ?? null,
      rootDeviceType: instance.RootDeviceType ?? null,
      rootDeviceName: instance.RootDeviceName ?? null,
      virtualizationType: instance.VirtualizationType ?? null,
      hypervisor: instance.Hypervisor ?? null,
      cpuOptions: instance.CpuOptions
        ? {
            coreCount: instance.CpuOptions.CoreCount ?? null,
            threadsPerCore: instance.CpuOptions.ThreadsPerCore ?? null,
          }
        : null,
      blockDeviceMappings: (instance.BlockDeviceMappings ?? []).map((bdm) => ({
        deviceName: bdm.DeviceName ?? null,
        volumeId: bdm.Ebs?.VolumeId ?? null,
        status: bdm.Ebs?.Status ?? null,
        attachTime: bdm.Ebs?.AttachTime?.toISOString() ?? null,
        deleteOnTermination: bdm.Ebs?.DeleteOnTermination ?? null,
      })),
      networkInterfaces: (instance.NetworkInterfaces ?? []).map((ni) => ({
        networkInterfaceId: ni.NetworkInterfaceId ?? null,
        subnetId: ni.SubnetId ?? null,
        vpcId: ni.VpcId ?? null,
        privateIpAddress: ni.PrivateIpAddress ?? null,
        publicIp: ni.Association?.PublicIp ?? null,
      })),
    },
  };
}

export function normalizeEc2Instances(
  instances: Instance[],
  params: { cloudAccountId: string; region: string },
): CloudResourceSnapshot[] {
  const snapshots: CloudResourceSnapshot[] = [];
  for (const instance of instances) {
    const snapshot = normalizeEc2Instance(instance, params);
    if (snapshot) {
      snapshots.push(snapshot);
    }
  }
  return snapshots;
}
