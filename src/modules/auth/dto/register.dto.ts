import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email dùng để đăng ký và đăng nhập',
    format: 'email',
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @ApiProperty({
    example: 'Password123',
    description: 'Mật khẩu, tối thiểu 8 ký tự',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  password!: string;

  @ApiProperty({
    example: 'Nguyễn Văn A',
    description: 'Họ tên hiển thị của người dùng',
  })
  @IsString()
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  fullName!: string;
}
