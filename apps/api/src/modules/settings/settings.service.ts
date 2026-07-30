import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import { AwsStsAdapter } from '@app/cloud-provider';
import { UpdateAwsControlPlaneDto, AwsAuthMethod } from './dto/update-aws-control-plane.dto';

const SETTING_KEY_AWS = 'aws_control_plane';

function maskAccessKey(key?: string): string {
  if (!key) return '—';
  if (key.length <= 8) return '••••' + key.slice(-4);
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

export interface AwsControlPlaneStatus {
  configured: boolean;
  status: 'CONNECTED' | 'NOT_CONFIGURED' | 'INVALID_CREDENTIALS' | 'PERMISSION_DENIED' | 'ERROR';
  authenticationMethod: AwsAuthMethod;
  accountId: string | null;
  principalArn: string | null;
  identityType: string;
  accessKeyMasked: string;
  defaultRegion: string;
  roleArn: string | null;
  lastVerifiedAt: string | null;
  lastError?: string | null;
  credentialCreatedAt?: string | null;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly awsStsAdapter: AwsStsAdapter,
  ) {}

  /**
   * GET /api/v1/settings/aws/control-plane
   */
  async getAwsControlPlane(): Promise<AwsControlPlaneStatus> {
    const saved = await this.prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_AWS },
    });

    const val = (saved?.value as Record<string, any>) || {};

    const authMethod = (val.authenticationMethod as AwsAuthMethod) ||
      (process.env.AWS_ROLE_ARN ? AwsAuthMethod.IAM_ROLE : AwsAuthMethod.ACCESS_KEY);

    const defaultRegion = val.defaultRegion || process.env.AWS_REGION || 'ap-southeast-1';
    const accessKeyId = val.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = val.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    const roleArn = val.roleArn || process.env.AWS_ROLE_ARN || null;

    if (!accessKeyId && !roleArn) {
      return {
        configured: false,
        status: 'NOT_CONFIGURED',
        authenticationMethod: authMethod,
        accountId: null,
        principalArn: null,
        identityType: '—',
        accessKeyMasked: '—',
        defaultRegion,
        roleArn: null,
        lastVerifiedAt: null,
      };
    }

    // Attempt STS identity verification
    try {
      let identity;
      if (accessKeyId && secretAccessKey) {
        identity = await this.awsStsAdapter.getCallerIdentityWithStaticCredentials(
          accessKeyId,
          secretAccessKey,
          defaultRegion,
        );
      } else {
        identity = await this.awsStsAdapter.getOwnCallerIdentity(defaultRegion);
      }

      const identityType = identity.arn.includes(':user/')
        ? 'IAM User'
        : identity.arn.includes(':role/')
          ? 'IAM Role'
          : 'IAM Identity';

      return {
        configured: true,
        status: 'CONNECTED',
        authenticationMethod: authMethod,
        accountId: identity.accountId,
        principalArn: identity.arn,
        identityType,
        accessKeyMasked: maskAccessKey(accessKeyId),
        defaultRegion,
        roleArn,
        lastVerifiedAt: val.lastVerifiedAt || new Date().toISOString(),
        credentialCreatedAt: val.createdAt || new Date().toISOString(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`STS verification failed in getAwsControlPlane: ${msg}`);

      const status = msg.toLowerCase().includes('denied')
        ? 'PERMISSION_DENIED'
        : msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('token')
          ? 'INVALID_CREDENTIALS'
          : 'ERROR';

      return {
        configured: true,
        status,
        authenticationMethod: authMethod,
        accountId: val.accountId || null,
        principalArn: val.principalArn || null,
        identityType: '—',
        accessKeyMasked: maskAccessKey(accessKeyId),
        defaultRegion,
        roleArn,
        lastVerifiedAt: val.lastVerifiedAt || null,
        lastError: msg,
      };
    }
  }

  /**
   * PUT /api/v1/settings/aws/control-plane
   */
  async updateAwsControlPlane(dto: UpdateAwsControlPlaneDto) {
    const authMethod = dto.authenticationMethod || AwsAuthMethod.ACCESS_KEY;
    const defaultRegion = dto.defaultRegion || process.env.AWS_REGION || 'ap-southeast-1';

    let callerIdentity;

    if (authMethod === AwsAuthMethod.ACCESS_KEY) {
      if (!dto.accessKeyId || !dto.secretAccessKey) {
        throw new BadRequestException(
          'Both accessKeyId and secretAccessKey are required for ACCESS_KEY method',
        );
      }

      try {
        callerIdentity = await this.awsStsAdapter.getCallerIdentityWithStaticCredentials(
          dto.accessKeyId,
          dto.secretAccessKey,
          defaultRegion,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new BadRequestException(`AWS Credentials validation failed via STS: ${msg}`);
      }
    } else {
      try {
        callerIdentity = await this.awsStsAdapter.getOwnCallerIdentity(defaultRegion);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new BadRequestException(`IAM Role validation failed via STS: ${msg}`);
      }
    }

    const payload = {
      authenticationMethod: authMethod,
      accessKeyId: dto.accessKeyId || null,
      secretAccessKey: dto.secretAccessKey || null,
      defaultRegion,
      roleArn: dto.roleArn || null,
      credentialLabel: dto.credentialLabel || 'Control Plane Credentials',
      accountId: callerIdentity.accountId,
      principalArn: callerIdentity.arn,
      lastVerifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await this.prisma.systemSetting.upsert({
      where: { key: SETTING_KEY_AWS },
      create: { key: SETTING_KEY_AWS, value: payload },
      update: { value: payload },
    });

    this.logger.log(
      `Updated AWS Control Plane credentials. AccountId: ${callerIdentity.accountId}`,
    );

    return this.getAwsControlPlane();
  }

  /**
   * POST /api/v1/settings/aws/control-plane/test
   */
  async testAwsControlPlane() {
    const current = await this.getAwsControlPlane();

    if (!current.configured || current.status === 'NOT_CONFIGURED') {
      throw new BadRequestException('AWS Control Plane is not configured');
    }

    return {
      success: current.status === 'CONNECTED',
      status: current.status,
      accountId: current.accountId,
      principalArn: current.principalArn,
      defaultRegion: current.defaultRegion,
      permissions: {
        getCallerIdentity: current.status === 'CONNECTED',
        assumeRole: true,
      },
      lastVerifiedAt: new Date().toISOString(),
    };
  }

  /**
   * DELETE /api/v1/settings/aws/control-plane
   */
  async deleteAwsControlPlane() {
    await this.prisma.systemSetting.deleteMany({
      where: { key: SETTING_KEY_AWS },
    });

    this.logger.log('Deleted AWS Control Plane configuration from DB');
    return { deleted: true };
  }
}
