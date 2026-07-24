import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ResourceSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  resourceType?: string;
}
