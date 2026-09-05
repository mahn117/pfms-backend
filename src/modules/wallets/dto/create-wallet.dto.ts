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
  @ApiProperty({
    example: 'Ví tiền mặt',
    description: 'Tên hiển thị của ví, do người dùng đặt',
  })
  @IsString()
  @IsNotEmpty({ message: 'Tên ví không được để trống' })
  name!: string;

  @ApiProperty({
    enum: WalletType,
    example: WalletType.CASH,
    description:
      'Loại ví: CASH (tiền mặt), BANK (ngân hàng), CREDIT_CARD (thẻ tín dụng), E_WALLET (ví điện tử), OTHER (khác)',
  })
  @IsEnum(WalletType, { message: 'Loại ví không hợp lệ' })
  type!: WalletType;

  @ApiPropertyOptional({
    example: 0,
    default: 0,
    description:
      'Số dư ban đầu khi tạo ví. currentBalance sẽ được khởi tạo bằng giá trị này',
  })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Số dư ban đầu không được âm' })
  initialBalance?: number;
}
