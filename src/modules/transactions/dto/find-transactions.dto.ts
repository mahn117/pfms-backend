import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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

const transformOptionalAmount = ({ value }: { value: unknown }) =>
  value === undefined || (typeof value === 'string' && value.trim() === '')
    ? undefined
    : Number(value);

export class FindTransactionsDto {
  @ApiPropertyOptional({
    example: '11111111-1111-4111-8111-111111111111',
    format: 'uuid',
    description: 'Lọc giao dịch theo ví cụ thể',
  })
  @IsOptional()
  @IsUUID('4')
  walletId?: string;

  @ApiPropertyOptional({
    example: '22222222-2222-4222-8222-222222222222',
    format: 'uuid',
    description: 'Lọc giao dịch theo danh mục cụ thể',
  })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({
    enum: TransactionType,
    example: TransactionType.EXPENSE,
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
    example: -100000,
    description:
      'Không bắt buộc; bỏ trống để không lọc. Ví dụ chỉ minh họa, không phải giá trị mặc định. So sánh với amount có dấu.',
  })
  @IsOptional()
  @Transform(transformOptionalAmount)
  @IsNumber()
  minAmount?: number;

  @ApiPropertyOptional({
    example: 1000000,
    description:
      'Không bắt buộc; bỏ trống để không lọc. Ví dụ chỉ minh họa, không phải giá trị mặc định. So sánh với amount có dấu.',
  })
  @IsOptional()
  @Transform(transformOptionalAmount)
  @IsNumber()
  maxAmount?: number;

  @ApiPropertyOptional({
    enum: ['date', 'amount'],
    example: 'date',
    default: 'date',
    description: 'Sắp xếp theo trường ngày hoặc số tiền',
  })
  @IsOptional()
  @IsIn(['date', 'amount'])
  sortBy?: 'date' | 'amount' = 'date';

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    example: 'desc',
    default: 'desc',
    description: 'Thứ tự sắp xếp: tăng dần (asc) hoặc giảm dần (desc)',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    type: 'integer',
    minimum: 1,
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
    type: 'integer',
    minimum: 1,
    description: 'Số lượng giao dịch trên mỗi trang',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
