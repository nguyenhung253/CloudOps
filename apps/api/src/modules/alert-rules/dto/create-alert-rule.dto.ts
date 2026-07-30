import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AlertOperator, AlertSeverity } from '@prisma/client';

export class CreateAlertRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsUUID()
  cloudAccountId!: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  resourceType?: string;

  @IsOptional()
  @IsUUID()
  metricDefinitionId?: string;

  @IsEnum(AlertOperator)
  operator!: AlertOperator;

  @IsNumber()
  threshold!: number;

  @IsInt()
  @Min(60)
  @Max(3600)
  durationSeconds!: number;

  @IsEnum(AlertSeverity)
  severity!: AlertSeverity;

  @IsInt()
  @Min(60)
  @Max(86400)
  cooldownSeconds!: number;

  @IsOptional()
  @IsNumber()
  recoveryThreshold?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
