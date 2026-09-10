import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TransactionsService);
    prisma.$transaction.mockImplementation((ops: any) => Promise.all(ops));
  });

  describe('create', () => {
    it('EXPENSE nên trừ currentBalance đúng số tiền', async () => {
      prisma.wallet.findFirst.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
      } as any);
      prisma.category.findFirst.mockResolvedValue({
        id: 'category-1',
        type: 'EXPENSE',
      } as any);
      prisma.transaction.create.mockResolvedValue({ id: 'tx-1' } as any);
      prisma.wallet.update.mockResolvedValue({} as any);

      await service.create('user-1', {
        type: 'EXPENSE',
        walletId: 'wallet-1',
        categoryId: 'category-1',
        amount: 50000,
        date: '2026-08-20',
      });

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { currentBalance: { increment: -50000 } },
      });
    });

    it('INCOME nên cộng currentBalance đúng số tiền', async () => {
      prisma.wallet.findFirst.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
      } as any);
      prisma.category.findFirst.mockResolvedValue({
        id: 'category-1',
        type: 'INCOME',
      } as any);
      prisma.transaction.create.mockResolvedValue({ id: 'tx-1' } as any);
      prisma.wallet.update.mockResolvedValue({} as any);

      await service.create('user-1', {
        type: 'INCOME',
        walletId: 'wallet-1',
        categoryId: 'category-1',
        amount: 200000,
        date: '2026-08-20',
      });

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { currentBalance: { increment: 200000 } },
      });
    });

    it('nên ném NotFoundException nếu ví không thuộc user', async () => {
      prisma.wallet.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          type: 'EXPENSE' as any,
          walletId: 'wallet-cua-user-2',
          categoryId: 'category-1',
          amount: 10000,
          date: '2026-08-20',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createTransfer', () => {
    it('nên trừ ví nguồn và cộng ví đích đúng số tiền', async () => {
      prisma.wallet.findFirst
        .mockResolvedValueOnce({ id: 'wallet-1', userId: 'user-1' } as any)
        .mockResolvedValueOnce({ id: 'wallet-2', userId: 'user-1' } as any);
      prisma.transaction.create.mockResolvedValue({ id: 'tx-1' } as any);
      prisma.wallet.update.mockResolvedValue({} as any);

      await service.createTransfer('user-1', {
        walletId: 'wallet-1',
        toWalletId: 'wallet-2',
        amount: 100000,
        date: '2026-08-20',
      });

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { currentBalance: { decrement: 100000 } },
      });
      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-2' },
        data: { currentBalance: { increment: 100000 } },
      });
    });

    it('nên ném BadRequestException nếu ví nguồn = ví đích', async () => {
      await expect(
        service.createTransfer('user-1', {
          walletId: 'wallet-1',
          toWalletId: 'wallet-1',
          amount: 100000,
          date: '2026-08-20',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('nên rollback (không tạo transaction) nếu 1 bước trong $transaction lỗi', async () => {
      prisma.wallet.findFirst
        .mockResolvedValueOnce({ id: 'wallet-1', userId: 'user-1' } as any)
        .mockResolvedValueOnce({ id: 'wallet-2', userId: 'user-1' } as any);
      prisma.transaction.create.mockResolvedValue({ id: 'tx-1' } as any);
      prisma.wallet.update
        .mockResolvedValueOnce({} as any) // trừ ví nguồn OK
        .mockRejectedValueOnce(new Error('DB error')); // cộng ví đích lỗi

      await expect(
        service.createTransfer('user-1', {
          walletId: 'wallet-1',
          toWalletId: 'wallet-2',
          amount: 100000,
          date: '2026-08-20',
        }),
      ).rejects.toThrow('DB error');
    });
  });

  describe('remove', () => {
    it('nên hoàn tác đúng số dư khi xoá giao dịch EXPENSE', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        walletId: 'wallet-1',
        type: 'EXPENSE',
        amount: 30000,
      } as any);
      prisma.transaction.update.mockResolvedValue({} as any);
      prisma.wallet.update.mockResolvedValue({} as any);

      await service.remove('user-1', 'tx-1');

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { currentBalance: { increment: 30000 } },
      });
    });

    it('nên ném NotFoundException nếu giao dịch không thuộc user', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.remove('user-1', 'tx-la')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addAttachment', () => {
    it('nên cập nhật attachmentUrl khi transaction thuộc user', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
      } as any);
      prisma.transaction.update.mockResolvedValue({
        id: 'tx-1',
        attachmentUrl: '/uploads/abc.jpg',
      } as any);

      const mockFile = {
        originalname: 'hoa-don.jpg',
        buffer: Buffer.from('fake-file-content'),
      } as Express.Multer.File;

      const result = await service.addAttachment('user-1', 'tx-1', mockFile);

      expect(prisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx-1' },
        data: { attachmentUrl: expect.stringMatching(/^\/uploads\/.+\.jpg$/) },
      });
      expect(result.attachmentUrl).toBe('/uploads/abc.jpg');
    });

    it('nên ném NotFoundException nếu transaction không thuộc user', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(
        service.addAttachment('user-1', 'tx-la', {
          originalname: 'file.jpg',
          buffer: Buffer.from('x'),
        } as Express.Multer.File),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllForExport', () => {
    it('nên gọi findMany với where clause đúng theo filter', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      await service.findAllForExport('user-1', {
        walletId: 'wallet-1',
        from: '2026-08-01',
        to: '2026-08-31',
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            walletId: 'wallet-1',
          }),
        }),
      );
    });
  });
});
