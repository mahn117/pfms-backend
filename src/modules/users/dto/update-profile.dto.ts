import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Nguyễn Văn A',
    description: 'Họ tên hiển thị mới',
  })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/avatar.png',
    nullable: true,
    description: 'Chuỗi địa chỉ ảnh đại diện',
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({
    example: 'vi',
    enum: ['vi', 'en'],
    description: 'Ngôn ngữ giao diện: tiếng Việt hoặc tiếng Anh',
  })
  @IsOptional()
  @IsString()
  @IsIn(['vi', 'en'])
  locale?: string;
}
