import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@/generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { GetReportSummaryDto } from './dto/get-report-summary.dto';
import { GetReportByCategoryDto } from './dto/get-report-by-category.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string, query: GetReportSummaryDto) {
    if (query.walletId) {
      await this.assertOwnedWallet(userId, query.walletId);
    }

    const dateFilter =
      query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {};

    const walletFilter = query.walletId ? { walletId: query.walletId } : {};

    const [incomeAgg, expenseAgg] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          userId,
          deletedAt: null,
          type: TransactionType.INCOME,
          ...walletFilter,
          ...dateFilter,
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          userId,
          deletedAt: null,
          type: TransactionType.EXPENSE,
          ...walletFilter,
          ...dateFilter,
        },
        _sum: { amount: true },
      }),
    ]);

    const totalIncome = Number(incomeAgg._sum.amount ?? 0);
    const totalExpense = Number(expenseAgg._sum.amount ?? 0);

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      walletId: query.walletId ?? null,
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
    };
  }

  async getByCategory(userId: string, query: GetReportByCategoryDto) {
    const dateFilter =
      query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {};

    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        deletedAt: null,
        type: query.type,
        ...dateFilter,
      },
      _sum: { amount: true },
    });

    const categoryIds = grouped
      .map((g) => g.categoryId)
      .filter((id): id is string => id !== null);

    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });

    const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));

    return grouped
      .filter((g) => g.categoryId !== null)
      .map((g) => ({
        categoryId: g.categoryId as string,
        categoryName:
          categoryNameMap.get(g.categoryId as string) ?? 'Không xác định',
        totalAmount: Number(g._sum.amount ?? 0),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
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
}
