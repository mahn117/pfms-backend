import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email đã đăng ký',
    format: 'email',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Password123',
    description: 'Mật khẩu tài khoản, tối thiểu 8 ký tự',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;
}
