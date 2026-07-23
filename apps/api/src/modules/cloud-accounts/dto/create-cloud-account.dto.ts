import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CloudProvider } from '@prisma/client';

export class CreateCloudAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEnum(CloudProvider)
  provider!: CloudProvider;

  /** AWS account ID (12 digits) or equivalent provider account identifier */
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^\d{12}$/, {
    message: 'providerAccountId must be a 12-digit AWS account ID',
  })
  providerAccountId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  @Matches(/^arn:aws:iam::\d{12}:role\/[\w+=,.@\-_/]+$/, {
    message: 'roleArn must be a valid IAM role ARN',
  })
  roleArn!: string;

  /** Plain external ID — encrypted before storage; never returned in responses */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  externalId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  regions!: string[];
}
