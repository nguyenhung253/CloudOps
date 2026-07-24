import type { Instance } from '@aws-sdk/client-ec2';
import {
  CloudResourceSnapshot,
  RESOURCE_TYPES,
} from '../types/cloud-resource.types';
import { tagsToRecord } from './aws-tags.util';

export { tagsToRecord } from './aws-tags.util';

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
