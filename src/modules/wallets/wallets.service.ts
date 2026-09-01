import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@/generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { GetWalletSummaryDto } from './dto/get-wallet-summary.dto';

@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWalletDto) {
    const initialBalance = dto.initialBalance ?? 0;
    return this.prisma.wallet.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
        initialBalance,
        currentBalance: initialBalance,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.wallet.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    return this.findOwnedOrThrow(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateWalletDto) {
    await this.findOwnedOrThrow(userId, id);

    return this.prisma.wallet.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        isArchived: dto.isArchived,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOwnedOrThrow(userId, id);

    await this.prisma.wallet.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Xóa ví thành công' };
  }

  async getSummary(userId: string, id: string, query: GetWalletSummaryDto) {
    const wallet = await this.findOwnedOrThrow(userId, id);

    const dateFilter =
      query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {};

    const [incomeAgg, expenseAgg] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          walletId: id,
          deletedAt: null,
          type: TransactionType.INCOME,
          ...dateFilter,
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          walletId: id,
          deletedAt: null,
          type: TransactionType.EXPENSE,
          ...dateFilter,
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      walletId: wallet.id,
      currentBalance: wallet.currentBalance,
      totalIncome: incomeAgg._sum.amount ?? 0,
      totalExpense: expenseAgg._sum.amount ?? 0,
      from: query.from ?? null,
      to: query.to ?? null,
    };
  }

  private async findOwnedOrThrow(userId: string, id: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!wallet) {
      throw new NotFoundException({
        errorCode: ErrorCode.WALLET_NOT_FOUND,
        message: 'Không tìm thấy ví',
      });
    }

    return wallet;
  }
}
