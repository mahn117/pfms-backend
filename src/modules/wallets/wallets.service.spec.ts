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
});
