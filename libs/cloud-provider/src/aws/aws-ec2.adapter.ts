import { Injectable, Logger } from '@nestjs/common';
import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
  DescribeVolumesCommand,
  type Instance,
  type SecurityGroup,
  type Volume,
} from '@aws-sdk/client-ec2';
import { normalizeEc2Instances } from './ec2-instance.normalizer';
import { normalizeEbsVolumes } from './ebs-volume.normalizer';
import { normalizeSecurityGroups } from './security-group.normalizer';
import type { CloudResourceSnapshot } from '../types/cloud-resource.types';

export interface AssumedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

export interface ResourceSummaryResult {
  ec2: {
    total: number;
    running: number;
    stopped: number;
  };
  vpcs: number;
  subnets: number;
  securityGroups: number;
  volumes: number;
}

@Injectable()
export class AwsEc2Adapter {
  private readonly logger = new Logger(AwsEc2Adapter.name);

  private createClient(region: string, credentials: AssumedCredentials): EC2Client {
    return new EC2Client({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });
  }

  /**
   * Describe all EC2 instances in a region (paginated) and normalize to
   * the shared CloudResourceSnapshot model.
   */
  async describeInstances(
    credentials: AssumedCredentials,
    region: string,
    cloudAccountId: string,
  ): Promise<CloudResourceSnapshot[]> {
    const client = this.createClient(region, credentials);
    const instances: Instance[] = [];
    let nextToken: string | undefined;

    do {
      const response = await client.send(
        new DescribeInstancesCommand({
          NextToken: nextToken,
        }),
      );

      for (const reservation of response.Reservations ?? []) {
        for (const instance of reservation.Instances ?? []) {
          instances.push(instance);
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    this.logger.debug(
      `DescribeInstances region=${region} account=${cloudAccountId} count=${instances.length}`,
    );

    return normalizeEc2Instances(instances, { cloudAccountId, region });
  }

  /**
   * Describe all EBS volumes in a region (paginated).
   */
  async describeVolumes(
    credentials: AssumedCredentials,
    region: string,
    cloudAccountId: string,
  ): Promise<CloudResourceSnapshot[]> {
    const client = this.createClient(region, credentials);
    const volumes: Volume[] = [];
    let nextToken: string | undefined;

    do {
      const response = await client.send(
        new DescribeVolumesCommand({
          NextToken: nextToken,
        }),
      );

      for (const volume of response.Volumes ?? []) {
        volumes.push(volume);
      }

      nextToken = response.NextToken;
    } while (nextToken);

    this.logger.debug(
      `DescribeVolumes region=${region} account=${cloudAccountId} count=${volumes.length}`,
    );

    return normalizeEbsVolumes(volumes, { cloudAccountId, region });
  }

  /**
   * Describe all security groups in a region (paginated).
   */
  async describeSecurityGroups(
    credentials: AssumedCredentials,
    region: string,
    cloudAccountId: string,
  ): Promise<CloudResourceSnapshot[]> {
    const client = this.createClient(region, credentials);
    const groups: SecurityGroup[] = [];
    let nextToken: string | undefined;

    do {
      const response = await client.send(
        new DescribeSecurityGroupsCommand({
          NextToken: nextToken,
          MaxResults: 1000,
        }),
      );

      for (const group of response.SecurityGroups ?? []) {
        groups.push(group);
      }

      nextToken = response.NextToken;
    } while (nextToken);

    this.logger.debug(
      `DescribeSecurityGroups region=${region} account=${cloudAccountId} count=${groups.length}`,
    );

    return normalizeSecurityGroups(groups, { cloudAccountId, region });
  }

  async fetchResourceSummary(
    credentials: AssumedCredentials,
    region: string,
  ): Promise<ResourceSummaryResult> {
    const client = this.createClient(region, credentials);

    const [instances, vpcs, subnets, sgs, volumes] = await Promise.all([
      this.getEc2InstancesCount(client),
      this.getVpcsCount(client),
      this.getSubnetsCount(client),
      this.getSecurityGroupsCount(client),
      this.getVolumesCount(client),
    ]);

    return {
      ec2: instances,
      vpcs,
      subnets,
      securityGroups: sgs,
      volumes,
    };
  }

  private async getEc2InstancesCount(client: EC2Client) {
    try {
      const response = await client.send(new DescribeInstancesCommand({}));
      let total = 0;
      let running = 0;
      let stopped = 0;

      if (response.Reservations) {
        for (const res of response.Reservations) {
          if (res.Instances) {
            for (const inst of res.Instances) {
              total++;
              const state = inst.State?.Name;
              if (state === 'running') {
                running++;
              } else if (state === 'stopped' || state === 'stopping') {
                stopped++;
              }
            }
          }
        }
      }

      return { total, running, stopped };
    } catch (e: any) {
      this.logger.warn(`Failed to DescribeInstances: ${e.message}`);
      return { total: 0, running: 0, stopped: 0 };
    }
  }

  private async getVpcsCount(client: EC2Client): Promise<number> {
    try {
      const response = await client.send(new DescribeVpcsCommand({}));
      return response.Vpcs?.length ?? 0;
    } catch (e: any) {
      this.logger.warn(`Failed to DescribeVpcs: ${e.message}`);
      return 0;
    }
  }

  private async getSubnetsCount(client: EC2Client): Promise<number> {
    try {
      const response = await client.send(new DescribeSubnetsCommand({}));
      return response.Subnets?.length ?? 0;
    } catch (e: any) {
      this.logger.warn(`Failed to DescribeSubnets: ${e.message}`);
      return 0;
    }
  }

  private async getSecurityGroupsCount(client: EC2Client): Promise<number> {
    try {
      const response = await client.send(new DescribeSecurityGroupsCommand({}));
      return response.SecurityGroups?.length ?? 0;
    } catch (e: any) {
      this.logger.warn(`Failed to DescribeSecurityGroups: ${e.message}`);
      return 0;
    }
  }

  private async getVolumesCount(client: EC2Client): Promise<number> {
    try {
      const response = await client.send(new DescribeVolumesCommand({}));
      return response.Volumes?.length ?? 0;
    } catch (e: any) {
      this.logger.warn(`Failed to DescribeVolumes: ${e.message}`);
      return 0;
    }
  }
}
