import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ReportsService);
  });

  describe('getSummary', () => {
    it('nên tính đúng totalIncome, totalExpense, balance', async () => {
      prisma.transaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 5000000 } } as any) // income
        .mockResolvedValueOnce({ _sum: { amount: 3200000 } } as any); // expense

      const result = await service.getSummary('user-1', {});

      expect(result).toEqual({
        from: null,
        to: null,
        walletId: null,
        totalIncome: 5000000,
        totalExpense: 3200000,
        balance: 1800000,
      });
    });

    it('nên trả về 0 nếu chưa có giao dịch nào trong kỳ', async () => {
      prisma.transaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } } as any)
        .mockResolvedValueOnce({ _sum: { amount: null } } as any);

      const result = await service.getSummary('user-1', {});

      expect(result.totalIncome).toBe(0);
      expect(result.totalExpense).toBe(0);
      expect(result.balance).toBe(0);
    });

    it('nên ném NotFoundException nếu walletId không thuộc user', async () => {
      prisma.wallet.findFirst.mockResolvedValue(null);

      await expect(
        service.getSummary('user-1', { walletId: 'wallet-cua-user-2' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('nên gọi aggregate với walletId khi có truyền walletId hợp lệ', async () => {
      prisma.wallet.findFirst.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
      } as any);
      prisma.transaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 1000000 } } as any)
        .mockResolvedValueOnce({ _sum: { amount: 200000 } } as any);

      await service.getSummary('user-1', { walletId: 'wallet-1' });

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ walletId: 'wallet-1' }),
        }),
      );
    });
  });

  describe('getByCategory', () => {
    it('nên trả về danh sách category kèm tổng tiền, map đúng tên', async () => {
      (prisma.transaction.groupBy as jest.Mock).mockResolvedValue([
        { categoryId: 'cat-1', _sum: { amount: 2000000 } },
        { categoryId: 'cat-2', _sum: { amount: 500000 } },
      ]);
      prisma.category.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Ăn uống' },
        { id: 'cat-2', name: 'Di chuyển' },
      ] as any);

      const result = await service.getByCategory('user-1', {
        type: 'EXPENSE',
      });

      expect(result).toEqual([
        { categoryId: 'cat-1', categoryName: 'Ăn uống', totalAmount: 2000000 },
        { categoryId: 'cat-2', categoryName: 'Di chuyển', totalAmount: 500000 },
      ]);
    });

    it('nên trả về mảng rỗng nếu không có giao dịch nào', async () => {
      (prisma.transaction.groupBy as jest.Mock).mockResolvedValue([]);
      prisma.category.findMany.mockResolvedValue([]);

      const result = await service.getByCategory('user-1', {
        type: 'EXPENSE',
      });

      expect(result).toEqual([]);
    });
  });
});
