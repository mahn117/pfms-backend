import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateGoalDto {
  @ApiProperty({
    example: 'Mua xe máy',
    description: 'Tên mục tiêu tiết kiệm',
  })
  @IsString()
  @IsNotEmpty({ message: 'Tên mục tiêu không được để trống' })
  name!: string;

  @ApiProperty({
    example: 20000000,
    description: 'Số tiền mục tiêu cần đạt được, phải lớn hơn 0',
  })
  @IsNumber()
  @IsPositive({ message: 'targetAmount phải lớn hơn 0' })
  targetAmount!: number;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Hạn chót đạt mục tiêu (ISO 8601, tuỳ chọn)',
  })
  @IsOptional()
  @IsDateString()
  deadline?: string;
}
