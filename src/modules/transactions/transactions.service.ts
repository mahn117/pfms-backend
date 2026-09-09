import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TransactionType } from '@/generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { FindTransactionsDto } from './dto/find-transactions.dto';
import { ExportTransactionsDto } from './dto/export-transactions.dto';
import { promises as fs } from 'fs';
import { basename, extname, join } from 'path';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTransactionDto) {
    const wallet = await this.assertOwnedWallet(userId, dto.walletId);
    await this.assertValidCategory(userId, dto.categoryId, dto.type);

    const delta = this.computeDelta(dto.type, dto.amount);

    const [transaction] = await this.prisma.$transaction([
      this.prisma.transaction.create({
        data: {
          userId,
          walletId: dto.walletId,
          categoryId: dto.categoryId,
          type: dto.type,
          amount: dto.amount,
          date: new Date(dto.date),
          note: dto.note,
        },
      }),
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { currentBalance: { increment: delta } },
      }),
    ]);

    return transaction;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const existing = await this.findOwnedOrThrow(userId, id);

    if (dto.categoryId) {
      await this.assertValidCategory(userId, dto.categoryId, existing.type);
    }

    const newAmount = dto.amount ?? Number(existing.amount);
    const oldDelta = this.computeDelta(existing.type, Number(existing.amount));
    const newDelta = this.computeDelta(existing.type, newAmount);
    const diff = newDelta - oldDelta;

    const updateTransactionQuery = this.prisma.transaction.update({
      where: { id },
      data: {
        amount: dto.amount,
        categoryId: dto.categoryId,
        date: dto.date ? new Date(dto.date) : undefined,
        note: dto.note,
      },
    });

    if (diff === 0) {
      return updateTransactionQuery;
    }

    const [updated] = await this.prisma.$transaction([
      updateTransactionQuery,
      this.prisma.wallet.update({
        where: { id: existing.walletId },
        data: { currentBalance: { increment: diff } },
      }),
    ]);

    return updated;
  }

  async remove(userId: string, id: string) {
    const existing = await this.findOwnedOrThrow(userId, id);

    if (existing.type === TransactionType.TRANSFER) {
      await this.prisma.$transaction([
        this.prisma.transaction.update({
          where: { id },
          data: { deletedAt: new Date() },
        }),
        this.prisma.wallet.update({
          where: { id: existing.walletId },
          data: { currentBalance: { increment: Number(existing.amount) } },
        }),
        this.prisma.wallet.update({
          where: { id: existing.toWalletId! },
          data: { currentBalance: { decrement: Number(existing.amount) } },
        }),
      ]);
      return { message: 'Xóa giao dịch thành công' };
    }

    const reverseDelta = -this.computeDelta(
      existing.type,
      Number(existing.amount),
    );

    await this.prisma.$transaction([
      this.prisma.transaction.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      this.prisma.wallet.update({
        where: { id: existing.walletId },
        data: { currentBalance: { increment: reverseDelta } },
      }),
    ]);

    return { message: 'Xóa giao dịch thành công' };
  }

  async createTransfer(userId: string, dto: CreateTransferDto) {
    if (dto.walletId === dto.toWalletId) {
      throw new BadRequestException({
        errorCode: ErrorCode.SAME_WALLET_TRANSFER,
        message: 'Ví nguồn và ví đích không được trùng nhau',
      });
    }

    const [fromWallet, toWallet] = await Promise.all([
      this.assertOwnedWallet(userId, dto.walletId),
      this.assertOwnedWallet(userId, dto.toWalletId),
    ]);

    const [transaction] = await this.prisma.$transaction([
      this.prisma.transaction.create({
        data: {
          userId,
          walletId: fromWallet.id,
          toWalletId: toWallet.id,
          type: TransactionType.TRANSFER,
          amount: dto.amount,
          date: new Date(dto.date),
          note: dto.note,
        },
      }),
      this.prisma.wallet.update({
        where: { id: fromWallet.id },
        data: { currentBalance: { decrement: dto.amount } },
      }),
      this.prisma.wallet.update({
        where: { id: toWallet.id },
        data: { currentBalance: { increment: dto.amount } },
      }),
    ]);

    return transaction;
  }

  async findAll(userId: string, query: FindTransactionsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'date';
    const sortOrder = query.sortOrder ?? 'desc';

    const hasAmountFilter =
      query.minAmount !== undefined || query.maxAmount !== undefined;
    const hasDateFilter = !!query.from || !!query.to;

    const where = {
      userId,
      deletedAt: null,
      ...(query.walletId ? { walletId: query.walletId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(hasDateFilter
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(hasAmountFilter
        ? {
            amount: {
              ...(query.minAmount !== undefined
                ? { gte: query.minAmount }
                : {}),
              ...(query.maxAmount !== undefined
                ? { lte: query.maxAmount }
                : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private readonly uploadDir = join(process.cwd(), 'uploads');

  async addAttachment(userId: string, id: string, file: Express.Multer.File) {
    await this.findOwnedOrThrow(userId, id);

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `${uniqueSuffix}${extname(file.originalname)}`;

    await fs.mkdir(this.uploadDir, { recursive: true });
    await fs.writeFile(join(this.uploadDir, filename), file.buffer);

    return this.prisma.transaction.update({
      where: { id },
      data: { attachmentUrl: `/uploads/${filename}` },
    });
  }

  async getAttachmentPath(userId: string, id: string): Promise<string> {
    const transaction = await this.findOwnedOrThrow(userId, id);

    if (!transaction.attachmentUrl) {
      throw new NotFoundException({
        errorCode: ErrorCode.ATTACHMENT_NOT_FOUND,
        message: 'Giao dịch này chưa có file đính kèm',
      });
    }

    const filename = basename(transaction.attachmentUrl);
    return join(this.uploadDir, filename);
  }

  async findOne(userId: string, id: string) {
    return this.findOwnedOrThrow(userId, id);
  }

  private computeDelta(type: TransactionType, amount: number): number {
    return type === TransactionType.INCOME ? amount : -amount;
  }

  private async assertOwnedWallet(userId: string, walletId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: walletId, userId, deletedAt: null },
    });
    if (!wallet) {
      throw new NotFoundException({
        errorCode: ErrorCode.WALLET_NOT_FOUND,
        message: 'Không tìm thấy ví',
      });
    }
    return wallet;
  }

  private async assertValidCategory(
    userId: string,
    categoryId: string,
    type: TransactionType,
  ) {
    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        deletedAt: null,
        OR: [{ userId }, { isSystem: true }],
      },
    });
    if (!category) {
      throw new BadRequestException({
        errorCode: ErrorCode.CATEGORY_NOT_FOUND,
        message: 'Không tìm thấy danh mục',
      });
    }
    if (category.type !== type) {
      throw new BadRequestException({
        errorCode: ErrorCode.TRANSACTION_CATEGORY_TYPE_MISMATCH,
        message: 'Danh mục không cùng loại với giao dịch',
      });
    }
  }

  private async findOwnedOrThrow(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!transaction) {
      throw new NotFoundException({
        errorCode: ErrorCode.TRANSACTION_NOT_FOUND,
        message: 'Không tìm thấy giao dịch',
      });
    }
    return transaction;
  }

  async findAllForExport(userId: string, query: ExportTransactionsDto) {
    return this.prisma.transaction.findMany({
      where: this.buildWhereClause(userId, query),
      orderBy: { date: 'desc' },
      include: { wallet: true, category: true },
    });
  }

  private buildWhereClause(
    userId: string,
    query: Partial<FindTransactionsDto>,
  ) {
    const hasAmountFilter =
      query.minAmount !== undefined || query.maxAmount !== undefined;
    const hasDateFilter = !!query.from || !!query.to;

    return {
      userId,
      deletedAt: null,
      ...(query.walletId ? { walletId: query.walletId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(hasDateFilter
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(hasAmountFilter
        ? {
            amount: {
              ...(query.minAmount !== undefined
                ? { gte: query.minAmount }
                : {}),
              ...(query.maxAmount !== undefined
                ? { lte: query.maxAmount }
                : {}),
            },
          }
        : {}),
    };
  }
}
