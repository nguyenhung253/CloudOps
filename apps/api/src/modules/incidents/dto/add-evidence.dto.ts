import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AddEvidenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  evidenceType!: string;

  @IsOptional()
  @IsUUID()
  jobExecutionId?: string;

  @IsOptional()
  @IsUUID()
  logQueryResultId?: string;

  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @IsOptional()
  @IsString()
  externalUrl?: string;

  @IsOptional()
  snapshot?: any;
}
