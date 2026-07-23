import { Injectable, Logger } from '@nestjs/common';
import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
  DescribeVolumesCommand,
} from '@aws-sdk/client-ec2';

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
