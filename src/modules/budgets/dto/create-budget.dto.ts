import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
} from 'class-validator';
import { BudgetPeriodType } from '@/generated/prisma/client';

export class CreateBudgetDto {
  @ApiPropertyOptional({
    example: 'uuid-cua-danh-muc',
    description:
      'ID danh mục áp dụng ngân sách. Bỏ trống nếu là ngân sách tổng (áp dụng cho tất cả danh mục)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'categoryId không hợp lệ' })
  categoryId?: string;

  @ApiProperty({
    enum: BudgetPeriodType,
    example: BudgetPeriodType.MONTH,
    description:
      'Loại kỳ ngân sách: MONTH (theo tháng) hoặc CUSTOM (tuỳ chỉnh)',
  })
  @IsEnum(BudgetPeriodType, { message: 'periodType không hợp lệ' })
  periodType!: BudgetPeriodType;

  @ApiProperty({
    example: '2026-08-01',
    description: 'Ngày bắt đầu kỳ ngân sách (ISO 8601)',
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    example: '2026-08-31',
    description: 'Ngày kết thúc kỳ ngân sách (ISO 8601)',
  })
  @IsDateString()
  endDate!: string;

  @ApiProperty({
    example: 2000000,
    description: 'Hạn mức chi tiêu cho kỳ ngân sách này, phải lớn hơn 0',
  })
  @IsNumber()
  @IsPositive({ message: 'limitAmount phải lớn hơn 0' })
  limitAmount!: number;
}
