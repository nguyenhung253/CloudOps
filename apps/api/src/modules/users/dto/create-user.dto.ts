import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

export class CreateUserDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập email' })
  email!: string;

  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password!: string;

  @IsString({ message: 'Họ tên không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập họ tên' })
  fullName!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsEnum(UserStatus)
  status!: UserStatus;
}
