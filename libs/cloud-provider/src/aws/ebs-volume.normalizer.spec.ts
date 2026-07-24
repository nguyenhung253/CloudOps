import { normalizeEbsVolume } from './ebs-volume.normalizer';
import type { Volume } from '@aws-sdk/client-ec2';

describe('ebs-volume.normalizer', () => {
  it('normalizes an EBS volume', () => {
    const volume: Volume = {
      VolumeId: 'vol-0123456789abcdef0',
      Size: 100,
      VolumeType: 'gp3',
      State: 'in-use',
      Encrypted: true,
      AvailabilityZone: 'ap-southeast-1a',
      Tags: [{ Key: 'Name', Value: 'data-disk' }],
      Attachments: [
        {
          InstanceId: 'i-abc',
          Device: '/dev/sdf',
          State: 'attached',
          DeleteOnTermination: false,
        },
      ],
    };

    const snapshot = normalizeEbsVolume(volume, {
      cloudAccountId: 'acc-1',
      region: 'ap-southeast-1',
    });

    expect(snapshot).toMatchObject({
      provider: 'AWS',
      resourceType: 'EBS_VOLUME',
      providerResourceId: 'vol-0123456789abcdef0',
      name: 'data-disk',
      status: 'in-use',
    });
    expect(snapshot?.metadata).toMatchObject({
      sizeGiB: 100,
      volumeType: 'gp3',
      encrypted: true,
    });
  });

  it('returns null without VolumeId', () => {
    expect(
      normalizeEbsVolume({} as Volume, { cloudAccountId: 'a', region: 'us-east-1' }),
    ).toBeNull();
  });
});
