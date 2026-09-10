import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class ReconcileWalletDto {
  @ApiProperty({
    example: 1500000,
    description:
      'Số dư thực tế người dùng nhập tay (kiểm đếm thật), dùng để so sánh với số dư hệ thống tính toán',
  })
  @IsNumber()
  @Min(0, { message: 'actualBalance không được âm' })
  actualBalance!: number;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'true = xác nhận tạo giao dịch điều chỉnh (ADJUSTMENT) nếu có chênh lệch. false/bỏ trống = chỉ xem trước (preview) chênh lệch, không tạo giao dịch',
  })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean = false;
}
