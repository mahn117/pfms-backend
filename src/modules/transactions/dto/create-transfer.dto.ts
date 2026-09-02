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
  @ApiProperty({ example: 'uuid-vi-nguon' })
  @IsUUID('4', { message: 'walletId (ví nguồn) không hợp lệ' })
  walletId!: string;

  @ApiProperty({ example: 'uuid-vi-dich' })
  @IsUUID('4', { message: 'toWalletId (ví đích) không hợp lệ' })
  toWalletId!: string;

  @ApiProperty({ example: 100000 })
  @IsNumber()
  @IsPositive({ message: 'amount phải lớn hơn 0' })
  amount!: number;

  @ApiProperty({ example: '2026-08-20' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: 'Chuyển tiền tiết kiệm' })
  @IsOptional()
  @IsString()
  note?: string;
}
