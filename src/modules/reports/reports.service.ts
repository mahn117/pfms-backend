import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TransactionType } from '@/generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { GetReportSummaryDto } from './dto/get-report-summary.dto';
import { GetReportByCategoryDto } from './dto/get-report-by-category.dto';
import { GetReportTrendDto } from './dto/get-report-trend.dto';

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

  async getTrend(userId: string, query: GetReportTrendDto) {
    if (query.walletId) {
      await this.assertOwnedWallet(userId, query.walletId);
    }

    const granularity = query.granularity ?? 'month';

    const { start, endExclusive } = this.resolveTrendDateRange(
      query.from,
      query.to,
      granularity,
    );

    const walletFilter = query.walletId ? { walletId: query.walletId } : {};

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        type: {
          in: [TransactionType.INCOME, TransactionType.EXPENSE],
        },
        ...walletFilter,

        date: {
          gte: start,
          lt: endExclusive,
        },
      },

      select: {
        type: true,
        amount: true,
        date: true,
      },

      orderBy: {
        date: 'asc',
      },
    });

    const bucketMap = new Map<
      string,
      {
        totalIncome: number;
        totalExpense: number;
      }
    >();

    for (const tx of transactions) {
      const period = this.resolvePeriodKey(tx.date, granularity);

      const bucket = bucketMap.get(period) ?? {
        totalIncome: 0,
        totalExpense: 0,
      };

      if (tx.type === TransactionType.INCOME) {
        bucket.totalIncome += Number(tx.amount);
      } else {
        bucket.totalExpense += Number(tx.amount);
      }

      bucketMap.set(period, bucket);
    }

    this.fillMissingPeriods(bucketMap, start, endExclusive, granularity);

    return [...bucketMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, { totalIncome, totalExpense }]) => ({
        period,
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
      }));
  }

  private resolvePeriodKey(date: Date, granularity: 'week' | 'month'): string {
    if (granularity === 'month') {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');

      return `${year}-${month}`;
    }

    const monday = this.startOfWeekUtc(date);

    const year = monday.getUTCFullYear();
    const month = String(monday.getUTCMonth() + 1).padStart(2, '0');

    const day = String(monday.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private fillMissingPeriods(
    bucketMap: Map<string, { totalIncome: number; totalExpense: number }>,
    start: Date,
    endExclusive: Date,
    granularity: 'week' | 'month',
  ) {
    let cursor =
      granularity === 'month'
        ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
        : this.startOfWeekUtc(start);

    while (cursor < endExclusive) {
      const period = this.resolvePeriodKey(cursor, granularity);

      if (!bucketMap.has(period)) {
        bucketMap.set(period, {
          totalIncome: 0,
          totalExpense: 0,
        });
      }

      if (granularity === 'month') {
        cursor = new Date(
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
        );
      } else {
        cursor = new Date(
          Date.UTC(
            cursor.getUTCFullYear(),
            cursor.getUTCMonth(),
            cursor.getUTCDate() + 7,
          ),
        );
      }
    }
  }

  private resolveTrendDateRange(
    from: string,
    to: string,
    granularity: 'week' | 'month',
  ) {
    if (granularity === 'month') {
      const [fromYear, fromMonth] = from.split('-').map(Number);
      const [toYear, toMonth] = to.split('-').map(Number);

      const start = new Date(Date.UTC(fromYear, fromMonth - 1, 1));

      const toMonthStart = new Date(Date.UTC(toYear, toMonth - 1, 1));

      if (start > toMonthStart) {
        throw new BadRequestException({
          errorCode: ErrorCode.INVALID_DATE_RANGE,
          message: 'from phải nhỏ hơn hoặc bằng to',
        });
      }

      const endExclusive = new Date(Date.UTC(toYear, toMonth, 1));

      return {
        start,
        endExclusive,
      };
    }

    const start = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T00:00:00.000Z`);

    if (start > toDate) {
      throw new BadRequestException({
        errorCode: ErrorCode.INVALID_DATE_RANGE,
        message: 'from phải nhỏ hơn hoặc bằng to',
      });
    }

    const endExclusive = new Date(toDate);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    return {
      start,
      endExclusive,
    };
  }

  private startOfWeekUtc(date: Date): Date {
    const result = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );

    const dayOfWeek = result.getUTCDay();

    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    result.setUTCDate(result.getUTCDate() + diffToMonday);

    return result;
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
