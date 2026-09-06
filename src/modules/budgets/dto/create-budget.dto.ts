import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
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
      'Loại kỳ ngân sách: MONTH (theo tháng, chỉ cần chọn tháng) hoặc CUSTOM (tuỳ chỉnh, tự nhập startDate/endDate)',
  })
  @IsEnum(BudgetPeriodType, { message: 'periodType không hợp lệ' })
  periodType!: BudgetPeriodType;

  @ApiPropertyOptional({
    example: '2026-08',
    description:
      'Tháng áp dụng ngân sách, định dạng YYYY-MM. Bắt buộc khi periodType = MONTH, không được gửi khi periodType = CUSTOM',
  })
  @ValidateIf(
    (dto: CreateBudgetDto) => dto.periodType === BudgetPeriodType.MONTH,
  )
  @IsNotEmpty({ message: 'month không được để trống khi periodType = MONTH' })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month phải có định dạng YYYY-MM, ví dụ 2026-08',
  })
  month?: string;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description:
      'Ngày bắt đầu kỳ ngân sách (ISO 8601). Bắt buộc khi periodType = CUSTOM, không được gửi khi periodType = MONTH',
  })
  @ValidateIf(
    (dto: CreateBudgetDto) => dto.periodType === BudgetPeriodType.CUSTOM,
  )
  @IsNotEmpty({
    message: 'startDate không được để trống khi periodType = CUSTOM',
  })
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
    description:
      'Ngày kết thúc kỳ ngân sách (ISO 8601). Bắt buộc khi periodType = CUSTOM, không được gửi khi periodType = MONTH',
  })
  @ValidateIf(
    (dto: CreateBudgetDto) => dto.periodType === BudgetPeriodType.CUSTOM,
  )
  @IsNotEmpty({
    message: 'endDate không được để trống khi periodType = CUSTOM',
  })
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    example: 2000000,
    description: 'Hạn mức chi tiêu cho kỳ ngân sách này, phải lớn hơn 0',
  })
  @IsNumber()
  @IsPositive({ message: 'limitAmount phải lớn hơn 0' })
  limitAmount!: number;
}
