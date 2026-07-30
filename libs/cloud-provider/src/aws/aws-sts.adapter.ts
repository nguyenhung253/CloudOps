import { Injectable, Logger } from '@nestjs/common';
import {
  STSClient,
  AssumeRoleCommand,
  GetCallerIdentityCommand,
} from '@aws-sdk/client-sts';

export interface AssumeRoleParams {
  roleArn: string;
  externalId?: string;
  roleSessionName?: string;
  durationSeconds?: number;
  region?: string;
}

export interface AssumeRoleResult {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  assumedRoleArn?: string;
  expiration?: Date;
}

export interface CallerIdentity {
  accountId: string;
  arn: string;
  userId: string;
}

export interface VerifyAwsConnectionParams {
  roleArn: string;
  externalId?: string;
  expectedAccountId: string;
  roleSessionName?: string;
  region?: string;
}

export interface VerifyAwsConnectionResult {
  success: boolean;
  assumedRoleArn?: string;
  callerAccountId?: string;
  callerArn?: string;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
}

@Injectable()
export class AwsStsAdapter {
  private readonly logger = new Logger(AwsStsAdapter.name);

  private createClient(region?: string, credentials?: AssumeRoleResult): STSClient {
    return new STSClient({
      region: region || process.env.AWS_REGION || 'us-east-1',
      ...(credentials
        ? {
            credentials: {
              accessKeyId: credentials.accessKeyId,
              secretAccessKey: credentials.secretAccessKey,
              sessionToken: credentials.sessionToken,
            },
          }
        : {}),
    });
  }

  async assumeRole(params: AssumeRoleParams): Promise<AssumeRoleResult> {
    const client = this.createClient(params.region);

    const response = await client.send(
      new AssumeRoleCommand({
        RoleArn: params.roleArn,
        RoleSessionName: params.roleSessionName || `cloudops-${Date.now()}`,
        ExternalId: params.externalId,
        DurationSeconds: params.durationSeconds ?? 900,
      }),
    );

    const credentials = response.Credentials;
    if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
      throw new Error('AssumeRole returned incomplete credentials');
    }

    return {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
      assumedRoleArn: response.AssumedRoleUser?.Arn,
      expiration: credentials.Expiration,
    };
  }

  async getCallerIdentity(
    credentials: AssumeRoleResult,
    region?: string,
  ): Promise<CallerIdentity> {
    const client = this.createClient(region, credentials);
    const response = await client.send(new GetCallerIdentityCommand({}));

    if (!response.Account || !response.Arn || !response.UserId) {
      throw new Error('GetCallerIdentity returned incomplete identity');
    }

    return {
      accountId: response.Account,
      arn: response.Arn,
      userId: response.UserId,
    };
  }

  async getOwnCallerIdentity(region?: string): Promise<CallerIdentity> {
    const client = this.createClient(region);
    const response = await client.send(new GetCallerIdentityCommand({}));

    if (!response.Account || !response.Arn || !response.UserId) {
      throw new Error('GetCallerIdentity returned incomplete identity');
    }

    return {
      accountId: response.Account,
      arn: response.Arn,
      userId: response.UserId,
    };
  }

  async getCallerIdentityWithStaticCredentials(
    accessKeyId: string,
    secretAccessKey: string,
    region?: string,
  ): Promise<CallerIdentity> {
    const client = new STSClient({
      region: region || process.env.AWS_REGION || 'ap-southeast-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    const response = await client.send(new GetCallerIdentityCommand({}));

    if (!response.Account || !response.Arn || !response.UserId) {
      throw new Error('GetCallerIdentity returned incomplete identity');
    }

    return {
      accountId: response.Account,
      arn: response.Arn,
      userId: response.UserId,
    };
  }

  /**
   * Full connection check: AssumeRole → GetCallerIdentity → compare account ID.
   */
  async verifyConnection(params: VerifyAwsConnectionParams): Promise<VerifyAwsConnectionResult> {
    const started = Date.now();

    try {
      const assumed = await this.assumeRole({
        roleArn: params.roleArn,
        externalId: params.externalId,
        roleSessionName: params.roleSessionName || `cloudops-conn-check`,
        region: params.region,
      });

      const identity = await this.getCallerIdentity(assumed, params.region);

      if (identity.accountId !== params.expectedAccountId) {
        return {
          success: false,
          assumedRoleArn: assumed.assumedRoleArn,
          callerAccountId: identity.accountId,
          callerArn: identity.arn,
          errorCode: 'ACCOUNT_ID_MISMATCH',
          errorMessage: `Expected AWS account ${params.expectedAccountId}, got ${identity.accountId}`,
          durationMs: Date.now() - started,
        };
      }

      return {
        success: true,
        assumedRoleArn: assumed.assumedRoleArn,
        callerAccountId: identity.accountId,
        callerArn: identity.arn,
        durationMs: Date.now() - started,
      };
    } catch (error: unknown) {
      const mapped = this.mapAwsError(error);
      this.logger.warn(`AWS connection check failed: ${mapped.errorCode} - ${mapped.errorMessage}`);
      return {
        success: false,
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
        durationMs: Date.now() - started,
      };
    }
  }

  private mapAwsError(error: unknown): { errorCode: string; errorMessage: string } {
    if (!error || typeof error !== 'object') {
      return { errorCode: 'UNKNOWN_ERROR', errorMessage: 'Unknown AWS error' };
    }

    const err = error as {
      name?: string;
      message?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };

    const name = err.name || err.Code || 'UNKNOWN_ERROR';
    const message = err.message || 'AWS request failed';

    if (
      name === 'AccessDenied' ||
      name === 'AccessDeniedException' ||
      message.toLowerCase().includes('access denied') ||
      message.toLowerCase().includes('not authorized')
    ) {
      return { errorCode: 'AWS_ACCESS_DENIED', errorMessage: message };
    }

    if (name === 'ExpiredToken' || name === 'ExpiredTokenException') {
      return { errorCode: 'AWS_TOKEN_EXPIRED', errorMessage: message };
    }

    if (
      name === 'Throttling' ||
      name === 'ThrottlingException' ||
      name === 'TooManyRequestsException' ||
      err.$metadata?.httpStatusCode === 429
    ) {
      return { errorCode: 'AWS_RATE_LIMITED', errorMessage: message };
    }

    if (name === 'InvalidClientTokenId' || name === 'UnrecognizedClientException') {
      return { errorCode: 'AWS_INVALID_CREDENTIALS', errorMessage: message };
    }

    return { errorCode: name, errorMessage: message };
  }
}
