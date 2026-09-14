import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email nhận mã OTP đặt lại mật khẩu',
    format: 'email',
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;
}
