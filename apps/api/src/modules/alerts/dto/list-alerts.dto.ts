import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AlertSeverity, AlertStatus } from '@prisma/client';

export class ListAlertsDto {
  @IsOptional()
  @IsUUID()
  alertRuleId?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @IsOptional()
  @IsString()
  search?: string;
}
