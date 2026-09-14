import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { IsTrendPeriod } from '../../../common/validators/is-trend-period.validator';

export class GetReportTrendDto {
  @ApiPropertyOptional({
    enum: ['week', 'month'],
    example: 'month',
    default: 'month',
    description: 'Đơn vị nhóm dữ liệu xu hướng: theo tuần hoặc theo tháng',
  })
  @IsOptional()
  @IsIn(['week', 'month'])
  granularity?: 'week' | 'month' = 'month';

  @ApiProperty({
    example: '2026-08',
    description: 'Mốc bắt đầu. Với month: YYYY-MM. Với week: YYYY-MM-DD',
  })
  @IsNotEmpty({ message: 'from không được để trống' })
  @IsTrendPeriod()
  from!: string;

  @ApiProperty({
    example: '2026-09',
    description: 'Mốc kết thúc. Với month: YYYY-MM. Với week: YYYY-MM-DD',
  })
  @IsNotEmpty({ message: 'to không được để trống' })
  @IsTrendPeriod()
  to!: string;

  @ApiPropertyOptional({
    example: '11111111-1111-4111-8111-111111111111',
    format: 'uuid',
    description:
      'Lọc theo 1 ví cụ thể. Bỏ trống nếu muốn tổng hợp trên tất cả các ví của user',
  })
  @IsOptional()
  @IsUUID('4', { message: 'walletId không hợp lệ' })
  walletId?: string;
}
