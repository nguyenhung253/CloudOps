import { Injectable, Logger } from '@nestjs/common';
import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  DescribeTagsCommand,
  type LoadBalancer,
  type Tag,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { normalizeApplicationLoadBalancers } from './alb.normalizer';
import type { AssumedCredentials } from './aws-ec2.adapter';
import type { CloudResourceSnapshot } from '../types/cloud-resource.types';

/** AWS DescribeTags accepts at most 20 resource ARNs per request. */
const DESCRIBE_TAGS_BATCH_SIZE = 20;

@Injectable()
export class AwsElbv2Adapter {
  private readonly logger = new Logger(AwsElbv2Adapter.name);

  private createClient(
    region: string,
    credentials: AssumedCredentials,
  ): ElasticLoadBalancingV2Client {
    return new ElasticLoadBalancingV2Client({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });
  }

  /**
   * Describe Application Load Balancers in a region (paginated), attach tags,
   * and normalize to CloudResourceSnapshot.
   *
   * Network / Gateway LBs are excluded — only Type=application.
   */
  async describeApplicationLoadBalancers(
    credentials: AssumedCredentials,
    region: string,
    cloudAccountId: string,
  ): Promise<CloudResourceSnapshot[]> {
    const client = this.createClient(region, credentials);
    const loadBalancers: LoadBalancer[] = [];
    let marker: string | undefined;

    do {
      const response = await client.send(
        new DescribeLoadBalancersCommand({
          Marker: marker,
          PageSize: 100,
        }),
      );

      for (const lb of response.LoadBalancers ?? []) {
        if (lb.Type === 'application') {
          loadBalancers.push(lb);
        }
      }

      marker = response.NextMarker;
    } while (marker);

    const tagsByArn = await this.fetchTagsByArn(
      client,
      loadBalancers
        .map((lb) => lb.LoadBalancerArn)
        .filter((arn): arn is string => Boolean(arn)),
    );

    this.logger.debug(
      `DescribeLoadBalancers(ALB) region=${region} account=${cloudAccountId} count=${loadBalancers.length}`,
    );

    return normalizeApplicationLoadBalancers(
      loadBalancers.map((lb) => ({
        lb,
        tags: lb.LoadBalancerArn ? tagsByArn.get(lb.LoadBalancerArn) : undefined,
      })),
      { cloudAccountId, region },
    );
  }

  private async fetchTagsByArn(
    client: ElasticLoadBalancingV2Client,
    arns: string[],
  ): Promise<Map<string, Tag[]>> {
    const result = new Map<string, Tag[]>();
    if (arns.length === 0) {
      return result;
    }

    for (let i = 0; i < arns.length; i += DESCRIBE_TAGS_BATCH_SIZE) {
      const batch = arns.slice(i, i + DESCRIBE_TAGS_BATCH_SIZE);
      try {
        const response = await client.send(
          new DescribeTagsCommand({ ResourceArns: batch }),
        );
        for (const description of response.TagDescriptions ?? []) {
          if (description.ResourceArn) {
            result.set(description.ResourceArn, description.Tags ?? []);
          }
        }
      } catch (error: any) {
        this.logger.warn(
          `DescribeTags failed for ${batch.length} ALB ARN(s): ${error?.message ?? error}`,
        );
      }
    }

    return result;
  }
}
