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
    description:
      'Loại giao dịch: INCOME (thu) hoặc EXPENSE (chi). Giao dịch TRANSFER dùng endpoint riêng /transactions/transfer',
  })
  @IsIn([TransactionType.INCOME, TransactionType.EXPENSE], {
    message: 'type chỉ được là INCOME hoặc EXPENSE ở API này',
  })
  type!: TransactionType;

  @ApiProperty({
    example: '11111111-1111-4111-8111-111111111111',
    format: 'uuid',
    description:
      'ID của ví thực hiện giao dịch, phải thuộc quyền sở hữu của user hiện tại',
  })
  @IsUUID('4', { message: 'walletId không hợp lệ' })
  walletId!: string;

  @ApiProperty({
    example: '22222222-2222-4222-8222-222222222222',
    format: 'uuid',
    description:
      'ID danh mục gắn với giao dịch, phải cùng loại (INCOME/EXPENSE) với type của giao dịch',
  })
  @IsUUID('4', { message: 'categoryId không hợp lệ' })
  categoryId!: string;

  @ApiProperty({
    example: 50000,
    minimum: 0,
    exclusiveMinimum: true,
    description: 'Số tiền giao dịch, phải lớn hơn 0',
  })
  @IsNumber()
  @IsPositive({ message: 'amount phải lớn hơn 0' })
  amount!: number;

  @ApiProperty({
    example: '2026-08-20',
    description:
      'Ngày phát sinh giao dịch (định dạng ISO 8601, ví dụ YYYY-MM-DD)',
  })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({
    example: 'Ăn trưa',
    nullable: true,
    description: 'Ghi chú cho giao dịch (tuỳ chọn)',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
