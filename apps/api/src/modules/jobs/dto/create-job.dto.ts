import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JobType } from '@prisma/client';

const MVP_JOB_TYPES = [JobType.RESOURCE_SYNC, JobType.HEALTH_CHECK] as const;

export class CreateJobDto {
  @IsEnum(JobType, {
    message: `type must be one of: ${MVP_JOB_TYPES.join(', ')} (MVP)`,
  })
  type!: JobType;

  @IsOptional()
  @IsUUID()
  cloudAccountId?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;

  /**
   * Full job context stored in PostgreSQL (not Redis).
   * e.g. RESOURCE_SYNC: { regions?, resourceTypes? }
   * e.g. HEALTH_CHECK: { cloudAccountId }
   */
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxAttempts?: number;
}
