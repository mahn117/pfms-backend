import { OmitType } from '@nestjs/swagger';
import { FindTransactionsDto } from './find-transactions.dto';

export class ExportTransactionsDto extends OmitType(FindTransactionsDto, [
  'page',
  'limit',
  'sortOrder',
  'sortBy',
] as const) {}
