import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({
    example: 'uuid-vi-nguon',
    description:
      'ID ví nguồn (nơi tiền được trừ ra), phải thuộc quyền sở hữu của user hiện tại',
  })
  @IsUUID('4', { message: 'walletId (ví nguồn) không hợp lệ' })
  walletId!: string;

  @ApiProperty({
    example: 'uuid-vi-dich',
    description:
      'ID ví đích (nơi tiền được cộng vào), phải thuộc quyền sở hữu của user hiện tại và khác với walletId',
  })
  @IsUUID('4', { message: 'toWalletId (ví đích) không hợp lệ' })
  toWalletId!: string;

  @ApiProperty({
    example: 100000,
    description: 'Số tiền chuyển khoản, phải lớn hơn 0',
  })
  @IsNumber()
  @IsPositive({ message: 'amount phải lớn hơn 0' })
  amount!: number;

  @ApiProperty({
    example: '2026-08-20',
    description:
      'Ngày thực hiện chuyển khoản (định dạng ISO 8601, ví dụ YYYY-MM-DD)',
  })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({
    example: 'Chuyển tiền tiết kiệm',
    description: 'Ghi chú cho giao dịch chuyển khoản (tuỳ chọn)',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
