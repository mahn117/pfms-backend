import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'OldPassword123',
    description: 'Mật khẩu hiện tại để xác minh tài khoản',
  })
  @IsString()
  currentPassword!: string;

  @ApiProperty({
    example: 'NewPassword123',
    description: 'Mật khẩu mới, tối thiểu 8 ký tự và khác mật khẩu hiện tại',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  newPassword!: string;
}
