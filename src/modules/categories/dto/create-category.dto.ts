import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { CategoryType } from '@/generated/prisma/client';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'Ăn uống',
    description: 'Tên danh mục thu/chi',
  })
  @IsString()
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  name!: string;

  @ApiProperty({
    enum: CategoryType,
    example: CategoryType.EXPENSE,
    description:
      'Loại danh mục: INCOME (thu) hoặc EXPENSE (chi). Danh mục con phải cùng loại với danh mục cha',
  })
  @IsEnum(CategoryType, { message: 'Loại danh mục không hợp lệ' })
  type!: CategoryType;

  @ApiPropertyOptional({
    example: 'fa-utensils',
    description: 'Tên icon hiển thị cho danh mục (tuỳ chọn)',
  })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({
    example: 'uuid-cua-danh-muc-cha',
    description:
      'ID của danh mục cha, dùng để tạo cấu trúc cây. Bỏ trống nếu đây là danh mục gốc',
  })
  @IsOptional()
  @IsUUID('4', { message: 'parentId không hợp lệ' })
  parentId?: string;
}
