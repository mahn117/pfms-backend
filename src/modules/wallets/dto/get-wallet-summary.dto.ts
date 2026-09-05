import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class GetWalletSummaryDto {
  @ApiPropertyOptional({
    example: '2026-08-01',
    description:
      'Ngày bắt đầu (định dạng ISO 8601, ví dụ YYYY-MM-DD) của kỳ cần tính tổng thu/chi. Bỏ trống nếu không giới hạn từ ngày nào',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
    description:
      'Ngày kết thúc (định dạng ISO 8601, ví dụ YYYY-MM-DD) của kỳ cần tính tổng thu/chi. Bỏ trống nếu không giới hạn đến ngày nào',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
