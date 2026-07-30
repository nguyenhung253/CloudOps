import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum AwsAuthMethod {
  ACCESS_KEY = 'ACCESS_KEY',
  IAM_ROLE = 'IAM_ROLE',
}

export class UpdateAwsControlPlaneDto {
  @IsOptional()
  @IsEnum(AwsAuthMethod, {
    message: 'authenticationMethod must be ACCESS_KEY or IAM_ROLE',
  })
  authenticationMethod?: AwsAuthMethod;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  accessKeyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  secretAccessKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  roleArn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  credentialLabel?: string;
}
