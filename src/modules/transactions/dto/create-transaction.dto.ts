import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { TransactionType } from '@/generated/prisma/client';

export class CreateTransactionDto {
  @ApiProperty({
    enum: [TransactionType.INCOME, TransactionType.EXPENSE],
    example: TransactionType.EXPENSE,
  })
  @IsIn([TransactionType.INCOME, TransactionType.EXPENSE], {
    message: 'type chỉ được là INCOME hoặc EXPENSE ở API này',
  })
  type!: TransactionType;

  @ApiProperty({ example: 'uuid-cua-vi' })
  @IsUUID('4', { message: 'walletId không hợp lệ' })
  walletId!: string;

  @ApiPropertyOptional({ example: 'uuid-cua-danh-muc' })
  @IsOptional()
  @IsUUID('4', { message: 'categoryId không hợp lệ' })
  categoryId?: string;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @IsPositive({ message: 'amount phải lớn hơn 0' })
  amount!: number;

  @ApiProperty({ example: '2026-08-20' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: 'Ăn trưa' })
  @IsOptional()
  @IsString()
  note?: string;
}
