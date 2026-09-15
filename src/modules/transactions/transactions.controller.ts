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
import {
  ApiBearerAuth,
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiProduces,
  ApiResponse,
} from '@nestjs/swagger';
import {
  ApiErrors,
  ApiSuccess,
  arrayOf,
  responseSchemas,
} from '@/common/swagger/response-schemas';
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
import { TransactionOwnershipGuard } from './guards/transaction-ownership.guard';
import type { Response } from 'express';
import { stringify } from 'csv-stringify';
import { ErrorCode } from '@/common/constants/error-codes';
@ApiTags('Transactions')
@ApiBearerAuth()
@ApiErrors(401)
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiSuccess(201, responseSchemas.transaction)
  @ApiErrors(400, 404)
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactionsService.create(user.userId, dto);
  }

  @Post('transfer')
  @ApiSuccess(201, responseSchemas.transaction)
  @ApiErrors(400, 404)
  createTransfer(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateTransferDto,
  ) {
    return this.transactionsService.createTransfer(user.userId, dto);
  }

  @Post(':id/attachment')
  @ApiSuccess(201, responseSchemas.transaction)
  @ApiErrors(400, 404, 413)
  @UseGuards(TransactionOwnershipGuard)
  @UseInterceptors(FileInterceptor('file', attachmentMulterOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: true,
    description:
      'File JPG, JPEG, PNG hoặc PDF; giới hạn dung lượng theo UPLOAD_MAX_SIZE_MB (mặc định 5 MB)',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Hoá đơn hoặc chứng từ đính kèm',
        },
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
  @ApiProduces('image/jpeg', 'image/png', 'application/pdf')
  @ApiResponse({
    status: 200,
    description: 'Trả trực tiếp nội dung file đính kèm; không có JSON envelope',
    content: Object.fromEntries(
      ['image/jpeg', 'image/png', 'application/pdf'].map((type) => [
        type,
        { schema: { type: 'string', format: 'binary' } },
      ]),
    ),
  })
  @ApiErrors(404)
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
  @ApiProduces('text/csv')
  @ApiResponse({
    status: 200,
    description:
      'CSV UTF-8 có BOM, trả trực tiếp dưới dạng attachment; không có JSON envelope',
    content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiErrors(400)
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
  @ApiSuccess(200, arrayOf(responseSchemas.transaction), true)
  @ApiErrors(400)
  findAll(
    @CurrentUser() user: { userId: string },
    @Query() query: FindTransactionsDto,
  ) {
    return this.transactionsService.findAll(user.userId, query);
  }

  @Get(':id')
  @ApiSuccess(200, responseSchemas.transaction)
  @ApiErrors(404)
  findOne(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.transactionsService.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiSuccess(200, responseSchemas.transaction)
  @ApiErrors(400, 404)
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @ApiSuccess(200, responseSchemas.message)
  @ApiErrors(404)
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.transactionsService.remove(user.userId, id);
  }
}
