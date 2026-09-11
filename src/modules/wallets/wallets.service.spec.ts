import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { WalletsService } from './wallets.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('WalletsService', () => {
  let service: WalletsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [WalletsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(WalletsService);
  });

  describe('create', () => {
    it('nên set currentBalance = initialBalance khi tạo ví', async () => {
      prisma.wallet.create.mockResolvedValue({} as any);

      await service.create('user-1', {
        name: 'Ví tiền mặt',
        type: 'CASH',
        initialBalance: 500000,
      });

      expect(prisma.wallet.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          initialBalance: 500000,
          currentBalance: 500000,
        }),
      });
    });

    it('nên mặc định initialBalance = 0 nếu không truyền', async () => {
      prisma.wallet.create.mockResolvedValue({} as any);

      await service.create('user-1', { name: 'Ví mới', type: 'CASH' });

      expect(prisma.wallet.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          initialBalance: 0,
          currentBalance: 0,
        }),
      });
    });
  });

  describe('findOne - quyền sở hữu', () => {
    it('nên ném NotFoundException nếu ví không tồn tại hoặc thuộc user khác', async () => {
      prisma.wallet.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('user-1', 'wallet-cua-user-2'),
      ).rejects.toThrow(NotFoundException);
    });

    it('nên trả về ví nếu đúng chủ sở hữu', async () => {
      const wallet = { id: 'wallet-1', userId: 'user-1' };
      prisma.wallet.findFirst.mockResolvedValue(wallet as any);

      const result = await service.findOne('user-1', 'wallet-1');
      expect(result).toEqual(wallet);
    });
  });

  describe('update - quyền sở hữu', () => {
    it('nên ném NotFoundException khi user A sửa ví của user B', async () => {
      prisma.wallet.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-A', 'wallet-cua-B', { name: 'Hack' } as any),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.wallet.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('nên soft-delete (set deletedAt) thay vì xoá cứng', async () => {
      prisma.wallet.findFirst.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
      } as any);
      prisma.wallet.update.mockResolvedValue({} as any);

      await service.remove('user-1', 'wallet-1');

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('getSummary', () => {
    it('nên tính đúng tổng thu/chi từ aggregate', async () => {
      prisma.wallet.findFirst.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        currentBalance: 1000000,
      } as any);
      prisma.transaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 2000000 } } as any)
        .mockResolvedValueOnce({ _sum: { amount: 500000 } } as any);

      const result = await service.getSummary('user-1', 'wallet-1', {});

      expect(result).toEqual({
        walletId: 'wallet-1',
        currentBalance: 1000000,
        totalIncome: 2000000,
        totalExpense: 500000,
        from: null,
        to: null,
      });
    });

    it('nên ném NotFoundException nếu user không sở hữu ví', async () => {
      prisma.wallet.findFirst.mockResolvedValue(null);

      await expect(
        service.getSummary('user-1', 'wallet-cua-B', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reconcile', () => {
    it('nên không tạo giao dịch nếu actualBalance khớp currentBalance', async () => {
      prisma.wallet.findFirst.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        currentBalance: 1000000,
      } as any);

      const result = await service.reconcile('user-1', 'wallet-1', {
        actualBalance: 1000000,
      });

      expect(result).toEqual({
        walletId: 'wallet-1',
        currentBalance: 1000000,
        actualBalance: 1000000,
        difference: 0,
        adjustmentCreated: false,
        message: 'Số dư khớp, không cần điều chỉnh',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('nên chỉ trả về preview, KHÔNG tạo giao dịch nếu confirm = false', async () => {
      prisma.wallet.findFirst.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        currentBalance: 1000000,
      } as any);

      const result = await service.reconcile('user-1', 'wallet-1', {
        actualBalance: 1100000,
        confirm: false,
      });

      expect(result).toEqual(
        expect.objectContaining({
          difference: 100000,
          adjustmentCreated: false,
        }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('nên tạo giao dịch ADJUSTMENT và set currentBalance = actualBalance khi confirm = true (chênh lệch dương)', async () => {
      prisma.wallet.findFirst.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        currentBalance: 1000000,
      } as any);
      prisma.$transaction.mockImplementation((ops: any) => Promise.all(ops));
      prisma.transaction.create.mockResolvedValue({ id: 'tx-1' } as any);
      prisma.wallet.update.mockResolvedValue({} as any);

      const result = await service.reconcile('user-1', 'wallet-1', {
        actualBalance: 1100000,
        confirm: true,
      });

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'ADJUSTMENT',
            amount: 100000,
            walletId: 'wallet-1',
          }),
        }),
      );
      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { currentBalance: 1100000 },
      });
      expect(result).toEqual(
        expect.objectContaining({
          adjustmentCreated: true,
          transactionId: 'tx-1',
          currentBalance: 1100000,
        }),
      );
    });

    it('nên tạo amount ÂM khi actualBalance nhỏ hơn currentBalance', async () => {
      prisma.wallet.findFirst.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        currentBalance: 1000000,
      } as any);
      prisma.$transaction.mockImplementation((ops: any) => Promise.all(ops));
      prisma.transaction.create.mockResolvedValue({ id: 'tx-2' } as any);
      prisma.wallet.update.mockResolvedValue({} as any);

      await service.reconcile('user-1', 'wallet-1', {
        actualBalance: 700000,
        confirm: true,
      });

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: -300000 }),
        }),
      );
    });

    it('nên ném NotFoundException nếu ví không thuộc user', async () => {
      prisma.wallet.findFirst.mockResolvedValue(null);

      await expect(
        service.reconcile('user-1', 'wallet-cua-user-2', {
          actualBalance: 500000,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('nên query đúng theo userId, loại trừ ví đã xoá mềm', async () => {
      prisma.wallet.findMany.mockResolvedValue([]);

      await service.findAll('user-1');

      expect(prisma.wallet.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('update - thành công', () => {
    it('nên update tên/loại/trạng thái lưu trữ khi ví thuộc đúng user', async () => {
      prisma.wallet.findFirst.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
      } as any);
      prisma.wallet.update.mockResolvedValue({ id: 'wallet-1' } as any);

      await service.update('user-1', 'wallet-1', {
        name: 'Ví đổi tên',
        isArchived: true,
      });

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: expect.objectContaining({
          name: 'Ví đổi tên',
          isArchived: true,
        }),
      });
    });
  });
});
