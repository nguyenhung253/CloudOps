import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsEnum(UserStatus)
  status!: UserStatus;
}
