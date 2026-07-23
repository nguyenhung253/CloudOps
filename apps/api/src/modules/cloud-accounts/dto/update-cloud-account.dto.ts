import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CloudAccountStatus } from '@prisma/client';

/** Status values operators may set via PATCH (not CONNECTED/ERROR — those come from connection checks) */
const UPDATABLE_STATUSES = [CloudAccountStatus.DISABLED, CloudAccountStatus.PENDING] as const;

export class UpdateCloudAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^arn:aws:iam::\d{12}:role\/[\w+=,.@\-_/]+$/, {
    message: 'roleArn must be a valid IAM role ARN',
  })
  roleArn?: string;

  /** Provide a new external ID to rotate; omit to keep existing. Never returned. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  externalId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  regions?: string[];

  /**
   * Enable/disable account:
   * - DISABLED: turn off
   * - PENDING: re-enable (must re-test connection for CONNECTED)
   */
  @IsOptional()
  @IsEnum(CloudAccountStatus)
  @ValidateIf((_, value) => value !== undefined)
  status?: (typeof UPDATABLE_STATUSES)[number];
}
