import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class SyncResourcesDto {
  /**
   * Optional subset of enabled account regions to sync.
   * When omitted, all enabled regions on the cloud account are used.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  regions?: string[];

  /**
   * Resource types to sync.
   * Supported: EC2_INSTANCE, EBS_VOLUME, SECURITY_GROUP, APPLICATION_LOAD_BALANCER.
   * Defaults to all supported types when omitted.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  resourceTypes?: string[];
}
