import type { Volume } from '@aws-sdk/client-ec2';
import {
  CloudResourceSnapshot,
  RESOURCE_TYPES,
} from '../types/cloud-resource.types';
import { tagsToRecord } from './aws-tags.util';

/**
 * Normalize an AWS EBS Volume into the shared CloudResourceSnapshot model.
 */
export function normalizeEbsVolume(
  volume: Volume,
  params: { cloudAccountId: string; region: string },
): CloudResourceSnapshot | null {
  if (!volume.VolumeId) {
    return null;
  }

  const tags = tagsToRecord(volume.Tags);
  const name = tags.Name || undefined;

  return {
    provider: 'AWS',
    cloudAccountId: params.cloudAccountId,
    region: params.region,
    resourceType: RESOURCE_TYPES.EBS_VOLUME,
    providerResourceId: volume.VolumeId,
    name,
    status: volume.State,
    tags,
    metadata: {
      sizeGiB: volume.Size ?? null,
      volumeType: volume.VolumeType ?? null,
      iops: volume.Iops ?? null,
      throughput: volume.Throughput ?? null,
      encrypted: volume.Encrypted ?? null,
      kmsKeyId: volume.KmsKeyId ?? null,
      snapshotId: volume.SnapshotId ?? null,
      availabilityZone: volume.AvailabilityZone ?? null,
      createTime: volume.CreateTime?.toISOString() ?? null,
      multiAttachEnabled: volume.MultiAttachEnabled ?? null,
      fastRestored: volume.FastRestored ?? null,
      outpostArn: volume.OutpostArn ?? null,
      attachments: (volume.Attachments ?? []).map((att) => ({
        instanceId: att.InstanceId ?? null,
        device: att.Device ?? null,
        state: att.State ?? null,
        attachTime: att.AttachTime?.toISOString() ?? null,
        deleteOnTermination: att.DeleteOnTermination ?? null,
      })),
    },
  };
}

export function normalizeEbsVolumes(
  volumes: Volume[],
  params: { cloudAccountId: string; region: string },
): CloudResourceSnapshot[] {
  const snapshots: CloudResourceSnapshot[] = [];
  for (const volume of volumes) {
    const snapshot = normalizeEbsVolume(volume, params);
    if (snapshot) {
      snapshots.push(snapshot);
    }
  }
  return snapshots;
}
