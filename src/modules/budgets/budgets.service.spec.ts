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
    it('nên ném BadRequestException nếu startDate >= endDate', async () => {
      await expect(
        service.create('user-1', {
          periodType: 'MONTH' as any,
          startDate: '2026-08-31',
          endDate: '2026-08-01',
          limitAmount: 1000000,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.budget.create).not.toHaveBeenCalled();
    });

    it('nên ném BadRequestException nếu category không phải EXPENSE', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'INCOME',
      } as any);

      await expect(
        service.create('user-1', {
          categoryId: 'cat-1',
          periodType: 'MONTH' as any,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          limitAmount: 1000000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('nên ném BadRequestException nếu trùng categoryId + startDate + endDate', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'EXPENSE',
      } as any);
      prisma.budget.findFirst.mockResolvedValue({
        id: 'budget-cu',
      } as any);

      await expect(
        service.create('user-1', {
          categoryId: 'cat-1',
          periodType: 'MONTH' as any,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          limitAmount: 1000000,
        }),
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
          periodType: 'MONTH' as any,
          startDate: '2026-08-15',
          endDate: '2026-08-30',
          limitAmount: 500000,
        }),
      ).resolves.toBeDefined();

      expect(prisma.budget.create).toHaveBeenCalled();
    });

    it('nên tạo budget thành công với dữ liệu hợp lệ', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        type: 'EXPENSE',
      } as any);
      prisma.budget.findFirst.mockResolvedValue(null);
      prisma.budget.create.mockResolvedValue({ id: 'budget-1' } as any);

      await service.create('user-1', {
        categoryId: 'cat-1',
        periodType: 'MONTH',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        limitAmount: 1000000,
      });

      expect(prisma.budget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            categoryId: 'cat-1',
            limitAmount: 1000000,
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('nên cập nhật thành công khi không có trùng lặp', async () => {
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
        } as any)
        .mockResolvedValueOnce(null);

      prisma.budget.update.mockResolvedValue({ id: 'budget-1' } as any);

      await service.update('user-1', 'budget-1', { limitAmount: 1500000 });

      expect(prisma.budget.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'budget-1' },
          data: expect.objectContaining({ limitAmount: 1500000 }),
        }),
      );
    });

    it('nên ném BadRequestException nếu update trùng với budget khác (không phải chính nó)', async () => {
      prisma.budget.findFirst
        .mockResolvedValueOnce({
          id: 'budget-1',
          userId: 'user-1',
          categoryId: 'cat-1',
          startDate: new Date('2026-08-01'),
          endDate: new Date('2026-08-31'),
          limitAmount: 1000000,
        } as any) // findOwnedOrThrow
        .mockResolvedValueOnce({ id: 'budget-2' } as any); // assertNoDuplicatePeriod tìm thấy bản ghi khác trùng

      await expect(
        service.update('user-1', 'budget-1', {
          startDate: '2026-09-01',
          endDate: '2026-09-30',
        }),
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
        } as any)
        .mockResolvedValueOnce(null);

      prisma.budget.update.mockResolvedValue({ id: 'budget-1' } as any);

      await service.update('user-1', 'budget-1', { limitAmount: 2000000 });

      expect(prisma.budget.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'budget-1' },
          }),
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
