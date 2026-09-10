import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@/generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { GetWalletSummaryDto } from './dto/get-wallet-summary.dto';
import { ReconcileWalletDto } from './dto/reconcile-wallet.dto';
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

  async reconcile(userId: string, id: string, dto: ReconcileWalletDto) {
    const wallet = await this.findOwnedOrThrow(userId, id);

    const currentBalance = Number(wallet.currentBalance);
    const difference = dto.actualBalance - currentBalance;

    if (difference === 0) {
      return {
        walletId: wallet.id,
        currentBalance,
        actualBalance: dto.actualBalance,
        difference: 0,
        adjustmentCreated: false,
        message: 'Số dư khớp, không cần điều chỉnh',
      };
    }

    if (!dto.confirm) {
      return {
        walletId: wallet.id,
        currentBalance,
        actualBalance: dto.actualBalance,
        difference,
        adjustmentCreated: false,
        message:
          'Có chênh lệch số dư. Gửi lại với confirm = true để tạo giao dịch điều chỉnh',
      };
    }

    const [transaction] = await this.prisma.$transaction([
      this.prisma.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: TransactionType.ADJUSTMENT,
          amount: difference,
          date: new Date(),
          note: `Đối soát: điều chỉnh số dư từ ${currentBalance} thành ${dto.actualBalance}`,
        },
      }),
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { currentBalance: dto.actualBalance },
      }),
    ]);

    return {
      walletId: wallet.id,
      currentBalance: dto.actualBalance,
      actualBalance: dto.actualBalance,
      difference,
      adjustmentCreated: true,
      transactionId: transaction.id,
      message: 'Đã tạo giao dịch điều chỉnh thành công',
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
