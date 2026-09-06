import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { CategoryType } from '@/generated/prisma/client';
import { TransactionType } from '@/generated/prisma/client';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateBudgetDto) {
    this.assertValidPeriod(dto.startDate, dto.endDate);

    if (dto.categoryId) {
      await this.assertValidCategory(userId, dto.categoryId);
    }

    await this.assertNoDuplicatePeriod(
      userId,
      dto.categoryId,
      dto.startDate,
      dto.endDate,
    );

    return this.prisma.budget.create({
      data: {
        userId,
        categoryId: dto.categoryId,
        periodType: dto.periodType,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        limitAmount: dto.limitAmount,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.budget.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    return this.findOwnedOrThrow(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateBudgetDto) {
    const existing = await this.findOwnedOrThrow(userId, id);

    const startDate = dto.startDate ?? existing.startDate.toISOString();
    const endDate = dto.endDate ?? existing.endDate.toISOString();
    this.assertValidPeriod(startDate, endDate);

    const finalCategoryId =
      dto.categoryId !== undefined ? dto.categoryId : existing.categoryId;

    if (finalCategoryId) {
      await this.assertValidCategory(userId, finalCategoryId);
    }

    await this.assertNoDuplicatePeriod(
      userId,
      finalCategoryId,
      startDate,
      endDate,
      id,
    );

    return this.prisma.budget.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        periodType: dto.periodType,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        limitAmount: dto.limitAmount,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOwnedOrThrow(userId, id);

    await this.prisma.budget.delete({ where: { id } });

    return { message: 'Xóa ngân sách thành công' };
  }

  async getProgress(userId: string, id: string) {
    const budget = await this.findOwnedOrThrow(userId, id);

    let categoryFilter = {};

    if (budget.categoryId) {
      const categoryIds = await this.getCategoryAndDescendantIds(
        userId,
        budget.categoryId,
      );

      categoryFilter = {
        categoryId: {
          in: categoryIds,
        },
      };
    }

    const spentAgg = await this.prisma.transaction.aggregate({
      where: {
        userId,
        deletedAt: null,
        type: TransactionType.EXPENSE,
        date: {
          gte: budget.startDate,
          lte: budget.endDate,
        },
        ...categoryFilter,
      },
      _sum: {
        amount: true,
      },
    });

    const spent = Number(spentAgg._sum.amount ?? 0);
    const limit = Number(budget.limitAmount);
    const remaining = limit - spent;

    const percentUsed =
      limit > 0 ? Math.round((spent / limit) * 10000) / 100 : 0;

    return {
      budgetId: budget.id,
      categoryId: budget.categoryId,
      periodType: budget.periodType,
      startDate: budget.startDate,
      endDate: budget.endDate,
      limitAmount: limit,
      spent,
      remaining,
      percentUsed,
      isOverThreshold80: percentUsed >= 80,
      isOverLimit: percentUsed >= 100,
    };
  }

  private async getCategoryAndDescendantIds(
    userId: string,
    rootCategoryId: string,
  ): Promise<string[]> {
    const categories = await this.prisma.category.findMany({
      where: {
        deletedAt: null,
        OR: [{ userId }, { isSystem: true }],
      },
      select: {
        id: true,
        parentId: true,
      },
    });

    const childrenMap = new Map<string, string[]>();

    for (const category of categories) {
      if (!category.parentId) continue;

      const children = childrenMap.get(category.parentId) ?? [];

      children.push(category.id);

      childrenMap.set(category.parentId, children);
    }

    const categoryIds = new Set<string>([rootCategoryId]);
    const queue = [rootCategoryId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      const children = childrenMap.get(currentId) ?? [];

      for (const childId of children) {
        if (categoryIds.has(childId)) continue;

        categoryIds.add(childId);
        queue.push(childId);
      }
    }

    return [...categoryIds];
  }

  private async assertNoDuplicatePeriod(
    userId: string,
    categoryId: string | null | undefined,
    startDate: string,
    endDate: string,
    excludeBudgetId?: string,
  ) {
    const duplicated = await this.prisma.budget.findFirst({
      where: {
        userId,
        categoryId: categoryId ?? null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        ...(excludeBudgetId ? { id: { not: excludeBudgetId } } : {}),
      },
    });

    if (duplicated) {
      throw new BadRequestException({
        errorCode: ErrorCode.BUDGET_PERIOD_OVERLAP,
        message:
          'Đã tồn tại ngân sách khác cho cùng danh mục (hoặc ngân sách tổng) với cùng khoảng thời gian',
      });
    }
  }

  private async findOwnedOrThrow(userId: string, id: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, userId },
    });

    if (!budget) {
      throw new NotFoundException({
        errorCode: ErrorCode.BUDGET_NOT_FOUND,
        message: 'Không tìm thấy ngân sách',
      });
    }

    return budget;
  }

  private async assertValidCategory(userId: string, categoryId: string) {
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

    if (category.type !== CategoryType.EXPENSE) {
      throw new BadRequestException({
        errorCode: ErrorCode.CATEGORY_TYPE_MISMATCH,
        message: 'Ngân sách chỉ áp dụng cho danh mục loại EXPENSE (chi tiêu)',
      });
    }
  }

  private assertValidPeriod(startDate: string, endDate: string) {
    if (new Date(startDate) >= new Date(endDate)) {
      throw new BadRequestException({
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'startDate phải nhỏ hơn endDate',
      });
    }
  }
}
