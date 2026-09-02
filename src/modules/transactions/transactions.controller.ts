import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { FindTransactionsDto } from './dto/find-transactions.dto';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactionsService.create(user.userId, dto);
  }

  @Post('transfer')
  createTransfer(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateTransferDto,
  ) {
    return this.transactionsService.createTransfer(user.userId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: { userId: string },
    @Query() query: FindTransactionsDto,
  ) {
    return this.transactionsService.findAll(user.userId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.transactionsService.findOne(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.transactionsService.remove(user.userId, id);
  }
}
