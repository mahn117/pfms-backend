import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateTransactionDto } from './create-transaction.dto';

export class UpdateTransactionDto extends PartialType(
  OmitType(CreateTransactionDto, ['type', 'walletId'] as const),
) {}
