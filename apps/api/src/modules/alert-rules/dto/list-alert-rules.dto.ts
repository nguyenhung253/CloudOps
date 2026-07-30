import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AlertSeverity } from '@prisma/client';

export class ListAlertRulesDto {
  @IsOptional()
  @IsUUID()
  cloudAccountId?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @IsOptional()
  @IsString()
  search?: string;
}
