import { IsOptional, IsInt, IsBoolean } from 'class-validator';

export class UpdateScheduleDto {
  @IsOptional()
  @IsInt()
  intervalMs?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
