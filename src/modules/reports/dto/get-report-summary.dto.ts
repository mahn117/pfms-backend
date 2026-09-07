import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class GetReportSummaryDto {
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

  @ApiPropertyOptional({
    example: 'uuid-cua-vi',
    description:
      'Lọc báo cáo theo 1 ví cụ thể. Bỏ trống nếu muốn tổng hợp trên tất cả các ví của user',
  })
  @IsOptional()
  @IsUUID('4', { message: 'walletId không hợp lệ' })
  walletId?: string;
}
