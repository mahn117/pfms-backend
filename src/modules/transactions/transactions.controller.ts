import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ExportTransactionsDto } from './dto/export-transactions.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { FindTransactionsDto } from './dto/find-transactions.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { attachmentMulterOptions } from './config/upload.config';
import type { Response } from 'express';
import { stringify } from 'csv-stringify';
import { ErrorCode } from '@/common/constants/error-codes';
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

  @Post(':id/attachment')
  @UseInterceptors(FileInterceptor('file', attachmentMulterOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  uploadAttachment(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException({
        errorCode: ErrorCode.INVALID_FILE_TYPE,
        message: 'Vui lòng chọn file đính kèm',
      });
    }

    return this.transactionsService.addAttachment(user.userId, id, file);
  }

  @Get(':id/attachment')
  async getAttachment(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const filePath = await this.transactionsService.getAttachmentPath(
      user.userId,
      id,
    );
    res.sendFile(filePath);
  }

  @Get('export')
  async exportCsv(
    @CurrentUser() user: { userId: string },
    @Query() query: ExportTransactionsDto,
    @Res() res: Response,
  ) {
    const transactions = await this.transactionsService.findAllForExport(
      user.userId,
      query,
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="transactions.csv"',
    );

    res.write('\uFEFF');

    const stringifier = stringify({
      header: true,
      columns: ['id', 'type', 'wallet', 'category', 'amount', 'date', 'note'],
    });

    stringifier.pipe(res);
    for (const tx of transactions) {
      stringifier.write({
        id: tx.id,
        type: tx.type,
        wallet: tx.wallet?.name ?? '',
        category: tx.category?.name ?? '',
        amount: tx.amount.toString(),
        date: tx.date.toISOString().slice(0, 10),
        note: tx.note ?? '',
      });
    }
    stringifier.end();
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
