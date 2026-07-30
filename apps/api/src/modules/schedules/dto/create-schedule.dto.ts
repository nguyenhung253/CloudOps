import {
  IsEnum,
  IsUUID,
  IsInt,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { ScheduleJobType } from '@prisma/client';

/** Allowed intervals per job type (in milliseconds). */
export const ALLOWED_INTERVALS: Record<ScheduleJobType, number[]> = {
  [ScheduleJobType.METRIC_COLLECTION]: [
    5 * 60_000,   // 5m
    10 * 60_000,  // 10m
    15 * 60_000,  // 15m
    30 * 60_000,  // 30m
  ],
  [ScheduleJobType.RESOURCE_SYNC]: [
    15 * 60_000,      // 15m
    30 * 60_000,      // 30m
    60 * 60_000,      // 1h
    6 * 60 * 60_000,  // 6h
  ],
};

export class CreateScheduleDto {
  @IsEnum(ScheduleJobType, {
    message: `jobType must be one of: ${Object.values(ScheduleJobType).join(', ')}`,
  })
  jobType!: ScheduleJobType;

  @IsUUID()
  cloudAccountId!: string;

  @IsInt()
  intervalMs!: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
