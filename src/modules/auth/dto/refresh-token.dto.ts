import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
    description:
      'Refresh token nhận từ đăng nhập hoặc lần refresh gần nhất; gửi trong body, không dùng Bearer access token',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
