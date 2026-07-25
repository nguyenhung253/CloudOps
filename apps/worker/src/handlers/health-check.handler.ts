import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/database';
import { AwsStsAdapter } from '@app/cloud-provider';
import {
  CloudAccountStatus,
  CloudProvider,
  JobType,
} from '@prisma/client';
import { decryptExternalId } from '@api/cloud-accounts/crypto/external-id.crypto';
import { AuditLogsService } from '@api/audit-logs/audit-logs.service';
import type {
  JobHandler,
  JobHandlerContext,
  JobHandlerResult,
} from './job-handler.interface';

@Injectable()
export class HealthCheckHandler implements JobHandler {
  readonly type = JobType.HEALTH_CHECK;

  constructor(
    private readonly prisma: PrismaService,
    private readonly awsStsAdapter: AwsStsAdapter,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private encryptionSecret(): string {
    return (
      this.configService.get<string>('EXTERNAL_ID_ENCRYPTION_KEY') ||
      this.configService.get<string>('JWT_SECRET') ||
      process.env.JWT_SECRET ||
      'dev-external-id-secret'
    );
  }

  async handle(ctx: JobHandlerContext): Promise<JobHandlerResult> {
    const { job, updateProgress, isCancelled } = ctx;
    const payload = (job.payload ?? {}) as { cloudAccountId?: string };
    const cloudAccountId = job.cloudAccountId ?? payload.cloudAccountId;

    if (!cloudAccountId) {
      throw new BadRequestException('HEALTH_CHECK job missing cloudAccountId');
    }

    await updateProgress(10, 'Loading cloud account');

    const account = await this.prisma.cloudAccount.findFirst({
      where: { id: cloudAccountId, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundException('Cloud account not found');
    }

    if (account.provider !== CloudProvider.AWS) {
      throw new BadRequestException('Health check is only supported for AWS accounts');
    }
    if (account.status === CloudAccountStatus.DISABLED) {
      throw new BadRequestException('Cannot health-check a disabled cloud account');
    }
    if (!account.roleArn) {
      throw new BadRequestException('Cloud account is missing IAM role ARN');
    }

    if (await isCancelled()) {
      throw new BadRequestException('Job was cancelled');
    }

    await updateProgress(40, 'Assuming role / verifying connection');

    let externalId: string | undefined;
    if (account.externalIdCiphertext) {
      externalId = decryptExternalId(
        account.externalIdCiphertext,
        this.encryptionSecret(),
      );
    }

    const result = await this.awsStsAdapter.verifyConnection({
      roleArn: account.roleArn,
      externalId,
      expectedAccountId: account.providerAccountId,
      roleSessionName: `cloudops-health-${account.id.slice(0, 8)}`,
    });

    await updateProgress(80, 'Persisting connection check');

    const nextStatus = result.success
      ? CloudAccountStatus.CONNECTED
      : CloudAccountStatus.ERROR;
    const checkedAt = new Date();

    const [check] = await this.prisma.$transaction([
      this.prisma.cloudConnectionCheck.create({
        data: {
          cloudAccountId: account.id,
          success: result.success,
          assumedRoleArn: result.assumedRoleArn ?? null,
          callerAccountId: result.callerAccountId ?? null,
          callerArn: result.callerArn ?? null,
          errorCode: result.errorCode ?? null,
          errorMessage: result.errorMessage ?? null,
          durationMs: result.durationMs,
          requestedBy: job.requestedBy,
        },
      }),
      this.prisma.cloudAccount.update({
        where: { id: account.id },
        data: {
          status: nextStatus,
          lastCheckedAt: checkedAt,
          lastErrorCode: result.success
            ? null
            : (result.errorCode ?? 'CONNECTION_FAILED'),
          lastErrorMessage: result.success
            ? null
            : (result.errorMessage ?? 'Connection failed'),
        },
      }),
    ]);

    await this.auditLogsService.create({
      actorUserId: job.requestedBy,
      action: 'CLOUD_ACCOUNT_HEALTH_CHECK',
      targetType: 'cloud_account',
      targetId: account.id,
      metadata: {
        success: result.success,
        jobId: job.id,
        checkId: check.id,
        errorCode: result.errorCode ?? null,
        durationMs: result.durationMs,
      },
    });

    await updateProgress(100, result.success ? 'Health check passed' : 'Health check failed');

    if (!result.success) {
      const err = new Error(result.errorMessage ?? 'Health check failed');
      (err as Error & { code?: string }).code =
        result.errorCode ?? 'HEALTH_CHECK_FAILED';
      throw err;
    }

    return {
      summary: {
        success: true,
        status: nextStatus,
        checkedAt,
        durationMs: result.durationMs,
        callerAccountId: result.callerAccountId ?? null,
        checkId: check.id,
      },
    };
  }
}
