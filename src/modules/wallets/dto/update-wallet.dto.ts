import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateWalletDto } from './create-wallet.dto';

export class UpdateWalletDto extends PartialType(
  OmitType(CreateWalletDto, ['initialBalance'] as const),
) {
  @ApiPropertyOptional({
    example: false,
    description: 'Đánh dấu ví đã lưu trữ hoặc mở lại ví',
  })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
