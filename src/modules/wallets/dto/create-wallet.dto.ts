import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { WalletType } from '@/generated/prisma/client';

export class CreateWalletDto {
  @ApiProperty({ example: 'Ví tiền mặt' })
  @IsString()
  @IsNotEmpty({ message: 'Tên ví không được để trống' })
  name!: string;

  @ApiProperty({ enum: WalletType, example: WalletType.CASH })
  @IsEnum(WalletType, { message: 'Loại ví không hợp lệ' })
  type!: WalletType;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Số dư ban đầu không được âm' })
  initialBalance?: number;
}
