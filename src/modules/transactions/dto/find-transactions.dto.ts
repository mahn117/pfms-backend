import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { TransactionType } from '@/generated/prisma/client';

export class FindTransactionsDto {
  @ApiPropertyOptional({
    example: 'uuid-cua-vi',
    description: 'Lọc giao dịch theo ví cụ thể',
  })
  @IsOptional()
  @IsUUID('4')
  walletId?: string;

  @ApiPropertyOptional({
    example: 'uuid-cua-danh-muc',
    description: 'Lọc giao dịch theo danh mục cụ thể',
  })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({
    enum: TransactionType,
    description:
      'Lọc giao dịch theo loại: INCOME, EXPENSE, TRANSFER hoặc ADJUSTMENT',
  })
  @IsOptional()
  @IsIn(Object.values(TransactionType))
  type?: TransactionType;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Lọc giao dịch từ ngày (định dạng ISO 8601, ví dụ YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
    description:
      'Lọc giao dịch đến ngày (định dạng ISO 8601, ví dụ YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'Lọc giao dịch có số tiền tối thiểu',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minAmount?: number;

  @ApiPropertyOptional({
    example: 1000000,
    description: 'Lọc giao dịch có số tiền tối đa',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number;

  @ApiPropertyOptional({
    enum: ['date', 'amount'],
    default: 'date',
    description: 'Sắp xếp theo trường ngày hoặc số tiền',
  })
  @IsOptional()
  @IsIn(['date', 'amount'])
  sortBy?: 'date' | 'amount' = 'date';

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    default: 'desc',
    description: 'Thứ tự sắp xếp: tăng dần (asc) hoặc giảm dần (desc)',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Số trang, bắt đầu từ 1',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    description: 'Số lượng giao dịch trên mỗi trang',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
