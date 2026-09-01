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

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTransactionDto) {
    const wallet = await this.assertOwnedWallet(userId, dto.walletId);
    if (dto.categoryId) {
      await this.assertValidCategory(userId, dto.categoryId, dto.type);
    }

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
      return this.prisma
        .$transaction([updateTransactionQuery])
        .then(([updated]) => updated);
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
        message: 'Danh mục không cùng loại (INCOME/EXPENSE) với giao dịch',
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
}
