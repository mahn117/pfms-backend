import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
        .mockResolvedValueOnce({ _sum: { amount: 5000000 } } as any)
        .mockResolvedValueOnce({ _sum: { amount: 3200000 } } as any);

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
        {
          categoryId: 'cat-1',
          categoryName: 'Ăn uống',
          totalAmount: 2000000,
        },
        {
          categoryId: 'cat-2',
          categoryName: 'Di chuyển',
          totalAmount: 500000,
        },
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

  describe('getTrend', () => {
    it('nên group đúng theo tháng và cộng dồn income/expense', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        {
          type: 'INCOME',
          amount: 1000000,
          date: new Date('2026-08-05T00:00:00.000Z'),
        },
        {
          type: 'EXPENSE',
          amount: 200000,
          date: new Date('2026-08-20T00:00:00.000Z'),
        },
        {
          type: 'INCOME',
          amount: 500000,
          date: new Date('2026-09-01T00:00:00.000Z'),
        },
      ] as any);

      const result = await service.getTrend('user-1', {
        granularity: 'month',
        from: '2026-08',
        to: '2026-09',
      });

      expect(result).toEqual([
        {
          period: '2026-08',
          totalIncome: 1000000,
          totalExpense: 200000,
          balance: 800000,
        },
        {
          period: '2026-09',
          totalIncome: 500000,
          totalExpense: 0,
          balance: 500000,
        },
      ]);
    });

    it('nên lọc month từ đầu tháng from đến trước đầu tháng sau của to', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      await service.getTrend('user-1', {
        granularity: 'month',
        from: '2026-08',
        to: '2026-09',
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: {
              gte: new Date('2026-08-01T00:00:00.000Z'),
              lt: new Date('2026-10-01T00:00:00.000Z'),
            },
          }),
        }),
      );
    });

    it('nên sắp xếp kết quả theo period tăng dần dù dữ liệu đầu vào không theo thứ tự', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        {
          type: 'INCOME',
          amount: 100000,
          date: new Date('2026-10-01T00:00:00.000Z'),
        },
        {
          type: 'INCOME',
          amount: 200000,
          date: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          type: 'INCOME',
          amount: 300000,
          date: new Date('2026-09-01T00:00:00.000Z'),
        },
      ] as any);

      const result = await service.getTrend('user-1', {
        granularity: 'month',
        from: '2026-08',
        to: '2026-10',
      });

      expect(result.map((r) => r.period)).toEqual([
        '2026-08',
        '2026-09',
        '2026-10',
      ]);
    });

    it('nên group đúng theo tuần, tuần bắt đầu từ Thứ Hai', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        {
          type: 'EXPENSE',
          amount: 50000,
          date: new Date('2026-08-20T00:00:00.000Z'),
        },
        {
          type: 'EXPENSE',
          amount: 30000,
          date: new Date('2026-08-18T00:00:00.000Z'),
        },
      ] as any);

      const result = await service.getTrend('user-1', {
        granularity: 'week',
        from: '2026-08-17',
        to: '2026-08-23',
      });

      expect(result).toEqual([
        {
          period: '2026-08-17',
          totalIncome: 0,
          totalExpense: 80000,
          balance: -80000,
        },
      ]);
    });

    it('nên tính cả ngày to khi granularity là week', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      await service.getTrend('user-1', {
        granularity: 'week',
        from: '2026-08-14',
        to: '2026-08-21',
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: {
              gte: new Date('2026-08-14T00:00:00.000Z'),
              lt: new Date('2026-08-22T00:00:00.000Z'),
            },
          }),
        }),
      );
    });

    it('nên fill các tháng không có giao dịch bằng giá trị 0', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      const result = await service.getTrend('user-1', {
        granularity: 'month',
        from: '2026-08',
        to: '2026-09',
      });

      expect(result).toEqual([
        {
          period: '2026-08',
          totalIncome: 0,
          totalExpense: 0,
          balance: 0,
        },
        {
          period: '2026-09',
          totalIncome: 0,
          totalExpense: 0,
          balance: 0,
        },
      ]);
    });

    it('nên fill đúng các tuần khi khoảng from/to cắt qua nhiều tuần', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      const result = await service.getTrend('user-1', {
        granularity: 'week',
        from: '2026-08-14',
        to: '2026-08-21',
      });

      expect(result).toEqual([
        {
          period: '2026-08-10',
          totalIncome: 0,
          totalExpense: 0,
          balance: 0,
        },
        {
          period: '2026-08-17',
          totalIncome: 0,
          totalExpense: 0,
          balance: 0,
        },
      ]);
    });

    it('nên ném BadRequestException nếu from > to với month', async () => {
      await expect(
        service.getTrend('user-1', {
          granularity: 'month',
          from: '2026-10',
          to: '2026-08',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('nên ném BadRequestException nếu from > to với week', async () => {
      await expect(
        service.getTrend('user-1', {
          granularity: 'week',
          from: '2026-08-21',
          to: '2026-08-14',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('nên ném NotFoundException nếu walletId không thuộc user', async () => {
      prisma.wallet.findFirst.mockResolvedValue(null);

      await expect(
        service.getTrend('user-1', {
          granularity: 'month',
          from: '2026-08',
          to: '2026-09',
          walletId: 'wallet-cua-user-2',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('nên gọi findMany với type INCOME/EXPENSE, walletId và date range khi có truyền', async () => {
      prisma.wallet.findFirst.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
      } as any);

      prisma.transaction.findMany.mockResolvedValue([]);

      await service.getTrend('user-1', {
        granularity: 'month',
        from: '2026-08',
        to: '2026-09',
        walletId: 'wallet-1',
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            walletId: 'wallet-1',
            type: { in: ['INCOME', 'EXPENSE'] },
            date: {
              gte: new Date('2026-08-01T00:00:00.000Z'),
              lt: new Date('2026-10-01T00:00:00.000Z'),
            },
          }),
        }),
      );
    });
  });
});
