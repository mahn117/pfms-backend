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
  @ApiProperty({ example: 'Ăn uống' })
  @IsString()
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  name!: string;

  @ApiProperty({ enum: CategoryType, example: CategoryType.EXPENSE })
  @IsEnum(CategoryType, { message: 'Loại danh mục không hợp lệ' })
  type!: CategoryType;

  @ApiPropertyOptional({ example: 'fa-utensils' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: 'uuid-cua-danh-muc-cha' })
  @IsOptional()
  @IsUUID('4', { message: 'parentId không hợp lệ' })
  parentId?: string;
}
