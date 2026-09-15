import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionOwnershipGuard } from './guards/transaction-ownership.guard';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionOwnershipGuard],
})
export class TransactionsModule {}
