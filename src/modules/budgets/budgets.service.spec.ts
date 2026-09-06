import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BudgetsService } from './budgets.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BudgetsService', () => {
  let service: BudgetsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [BudgetsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(BudgetsService);
  });

  describe('create', () => {
    it('nên tự tính startDate/endDate là đầu/cuối tháng khi periodType = MONTH', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'EXPENSE',
      } as any);
      prisma.budget.findFirst.mockResolvedValue(null);
      prisma.budget.create.mockResolvedValue({ id: 'budget-1' } as any);

      await service.create('user-1', {
        categoryId: 'cat-1',
        periodType: 'MONTH',
        month: '2026-08',
        limitAmount: 1000000,
      });

      expect(prisma.budget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startDate: new Date(Date.UTC(2026, 7, 1)),
            endDate: new Date(Date.UTC(2026, 7, 31)),
          }),
        }),
      );
    });

    it('nên tự tính đúng ngày cuối tháng 2 năm nhuận (2028)', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'EXPENSE',
      } as any);
      prisma.budget.findFirst.mockResolvedValue(null);
      prisma.budget.create.mockResolvedValue({ id: 'budget-1' } as any);

      await service.create('user-1', {
        categoryId: 'cat-1',
        periodType: 'MONTH',
        month: '2028-02',
        limitAmount: 1000000,
      });

      expect(prisma.budget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            endDate: new Date(Date.UTC(2028, 1, 29)), // năm nhuận: tháng 2 có 29 ngày
          }),
        }),
      );
    });

    it('nên dùng đúng startDate/endDate người nhập khi periodType = CUSTOM', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'EXPENSE',
      } as any);
      prisma.budget.findFirst.mockResolvedValue(null);
      prisma.budget.create.mockResolvedValue({ id: 'budget-1' } as any);

      await service.create('user-1', {
        categoryId: 'cat-1',
        periodType: 'CUSTOM',
        startDate: '2026-08-15',
        endDate: '2026-08-30',
        limitAmount: 1000000,
      });

      expect(prisma.budget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startDate: new Date('2026-08-15'),
            endDate: new Date('2026-08-30'),
          }),
        }),
      );
    });

    it('nên ném BadRequestException nếu category không phải EXPENSE', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'INCOME',
      } as any);

      await expect(
        service.create('user-1', {
          categoryId: 'cat-1',
          periodType: 'CUSTOM' as any,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          limitAmount: 1000000,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('nên ném BadRequestException nếu trùng categoryId + startDate + endDate', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'EXPENSE',
      } as any);
      prisma.budget.findFirst.mockResolvedValue({ id: 'budget-cu' } as any);

      await expect(
        service.create('user-1', {
          categoryId: 'cat-1',
          periodType: 'CUSTOM' as any,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          limitAmount: 1000000,
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.budget.create).not.toHaveBeenCalled();
    });

    it('nên ném BadRequestException nếu gửi startDate/endDate khi periodType = MONTH', async () => {
      await expect(
        service.create('user-1', {
          categoryId: 'cat-1',
          periodType: 'MONTH' as any,
          month: '2026-08',
          startDate: '2025-03-01',
          endDate: '2025-03-31',
          limitAmount: 1000000,
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.budget.create).not.toHaveBeenCalled();
    });

    it('nên ném BadRequestException nếu gửi month khi periodType = CUSTOM', async () => {
      await expect(
        service.create('user-1', {
          categoryId: 'cat-1',
          periodType: 'CUSTOM' as any,
          month: '2026-08',
          startDate: '2025-03-01',
          endDate: '2025-03-31',
          limitAmount: 1000000,
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.budget.create).not.toHaveBeenCalled();
    });

    it('không ném lỗi nếu cùng category nhưng khoảng thời gian khác nhau (chỉ giao nhau, không trùng tuyệt đối)', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'EXPENSE',
      } as any);
      prisma.budget.findFirst.mockResolvedValue(null);
      prisma.budget.create.mockResolvedValue({ id: 'budget-2' } as any);

      await expect(
        service.create('user-1', {
          categoryId: 'cat-1',
          periodType: 'CUSTOM' as any,
          startDate: '2026-08-15',
          endDate: '2026-08-30',
          limitAmount: 500000,
        } as any),
      ).resolves.toBeDefined();
    });
  });

  describe('update', () => {
    it('nên cập nhật categoryId/limitAmount thành công, không đổi ngày', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-2',
        type: 'EXPENSE',
      } as any);
      prisma.budget.findFirst
        .mockResolvedValueOnce({
          id: 'budget-1',
          userId: 'user-1',
          categoryId: 'cat-1',
          startDate: new Date('2026-08-01'),
          endDate: new Date('2026-08-31'),
          limitAmount: 1000000,
        } as any)
        .mockResolvedValueOnce(null);
      prisma.budget.update.mockResolvedValue({ id: 'budget-1' } as any);

      await service.update('user-1', 'budget-1', {
        categoryId: 'cat-2',
        limitAmount: 1500000,
      });

      expect(prisma.budget.update).toHaveBeenCalledWith({
        where: { id: 'budget-1' },
        data: { categoryId: 'cat-2', limitAmount: 1500000 },
      });
    });

    it('nên ném BadRequestException nếu category mới trùng lịch với budget khác', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-2',
        type: 'EXPENSE',
      } as any);
      prisma.budget.findFirst
        .mockResolvedValueOnce({
          id: 'budget-1',
          userId: 'user-1',
          categoryId: 'cat-1',
          startDate: new Date('2026-08-01'),
          endDate: new Date('2026-08-31'),
          limitAmount: 1000000,
        } as any)
        .mockResolvedValueOnce({ id: 'budget-khac' } as any);

      await expect(
        service.update('user-1', 'budget-1', { categoryId: 'cat-2' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.budget.update).not.toHaveBeenCalled();
    });

    it('nên loại trừ chính nó khi kiểm tra trùng lặp (excludeBudgetId)', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'EXPENSE',
      } as any);
      prisma.budget.findFirst
        .mockResolvedValueOnce({
          id: 'budget-1',
          userId: 'user-1',
          categoryId: 'cat-1',
          startDate: new Date('2026-08-01'),
          endDate: new Date('2026-08-31'),
          limitAmount: 1000000,
        } as any) // gọi từ findOwnedOrThrow
        .mockResolvedValueOnce(null); // gọi từ assertNoDuplicatePeriod
      prisma.budget.update.mockResolvedValue({ id: 'budget-1' } as any);

      await service.update('user-1', 'budget-1', { limitAmount: 2000000 });

      expect(prisma.budget.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: 'budget-1' } }),
        }),
      );
    });
  });

  describe('findOne - quyền sở hữu', () => {
    it('nên ném NotFoundException nếu budget không thuộc user', async () => {
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('user-1', 'budget-cua-user-2'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('nên xoá cứng budget (không có deletedAt trong schema)', async () => {
      prisma.budget.findFirst.mockResolvedValue({
        id: 'budget-1',
        userId: 'user-1',
      } as any);

      prisma.budget.delete.mockResolvedValue({} as any);

      await service.remove('user-1', 'budget-1');

      expect(prisma.budget.delete).toHaveBeenCalledWith({
        where: { id: 'budget-1' },
      });
    });
  });

  describe('getProgress', () => {
    it('nên tính transaction của category và toàn bộ category con', async () => {
      prisma.budget.findFirst.mockResolvedValue({
        id: 'budget-1',
        userId: 'user-1',
        categoryId: 'food',
        periodType: 'MONTH',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
        limitAmount: 1000000,
      } as any);

      prisma.category.findMany.mockResolvedValue([
        { id: 'food', parentId: null },
        { id: 'drink', parentId: 'food' },
        { id: 'coffee', parentId: 'drink' },
        { id: 'milk-tea', parentId: 'drink' },
      ] as any);

      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: 500000 },
      } as any);

      const result = await service.getProgress('user-1', 'budget-1');

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            type: 'EXPENSE',
            categoryId: {
              in: ['food', 'drink', 'coffee', 'milk-tea'],
            },
          }),
        }),
      );

      expect(result.spent).toBe(500000);
      expect(result.remaining).toBe(500000);
      expect(result.percentUsed).toBe(50);
      expect(result.isOverThreshold80).toBe(false);
      expect(result.isOverLimit).toBe(false);
    });

    it('nên đánh dấu isOverLimit = true khi chi vượt quá limitAmount', async () => {
      prisma.budget.findFirst.mockResolvedValue({
        id: 'budget-1',
        userId: 'user-1',
        categoryId: null,
        periodType: 'MONTH',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
        limitAmount: 500000,
      } as any);

      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: 600000 },
      } as any);

      const result = await service.getProgress('user-1', 'budget-1');

      expect(result.isOverLimit).toBe(true);
      expect(result.remaining).toBe(-100000);
    });

    it('nên trả spent = 0 nếu chưa có giao dịch nào trong kỳ', async () => {
      prisma.budget.findFirst.mockResolvedValue({
        id: 'budget-1',
        userId: 'user-1',
        categoryId: 'cat-1',
        periodType: 'MONTH',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
        limitAmount: 500000,
      } as any);

      prisma.category.findMany.mockResolvedValue([
        {
          id: 'cat-1',
          parentId: null,
        },
      ] as any);

      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: null },
      } as any);

      const result = await service.getProgress('user-1', 'budget-1');

      expect(result.spent).toBe(0);
      expect(result.percentUsed).toBe(0);
    });

    it('nên ném NotFoundException nếu budget không tồn tại', async () => {
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(service.getProgress('user-1', 'budget-la')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
