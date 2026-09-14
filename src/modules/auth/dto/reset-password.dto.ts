import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email của tài khoản cần đặt lại mật khẩu',
    format: 'email',
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @ApiProperty({
    example: '123456',
    description: 'Mã OTP gồm 6 ký tự được cấp qua forgot-password',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @Length(6, 6, { message: 'OTP phải gồm 6 chữ số' })
  otp!: string;

  @ApiProperty({
    example: 'NewPassword123',
    description: 'Mật khẩu mới, tối thiểu 8 ký tự',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  newPassword!: string;
}
