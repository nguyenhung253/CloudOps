import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListIncidentsDto {
  @IsOptional()
  @IsUUID()
  primaryResourceId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
