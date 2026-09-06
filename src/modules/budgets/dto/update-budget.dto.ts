import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateBudgetDto } from './create-budget.dto';

export class UpdateBudgetDto extends PartialType(
  OmitType(CreateBudgetDto, [
    'periodType',
    'month',
    'startDate',
    'endDate',
  ] as const),
) {}
