import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { TransactionType } from '@/generated/prisma/client';

export class GetReportByCategoryDto {
  @ApiPropertyOptional({
    example: '2026-08-01',
    description:
      'Ngày bắt đầu (ISO 8601, YYYY-MM-DD) của kỳ báo cáo. Bỏ trống nếu không giới hạn từ ngày nào',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
    description:
      'Ngày kết thúc (ISO 8601, YYYY-MM-DD) của kỳ báo cáo. Bỏ trống nếu không giới hạn đến ngày nào',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({
    enum: [TransactionType.INCOME, TransactionType.EXPENSE],
    example: TransactionType.EXPENSE,
    description:
      'Loại giao dịch cần phân bổ theo danh mục: INCOME hoặc EXPENSE',
  })
  @IsIn([TransactionType.INCOME, TransactionType.EXPENSE], {
    message: 'type chỉ được là INCOME hoặc EXPENSE',
  })
  type!: TransactionType;
}
