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

  describe('update', () => {
    it('EXPENSE tăng amount nên trừ thêm đúng phần chênh lệch vào ví', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        walletId: 'wallet-1',
        type: 'EXPENSE',
        amount: 50000,
      } as any);
      prisma.transaction.update.mockResolvedValue({ id: 'tx-1' } as any);
      prisma.wallet.update.mockResolvedValue({} as any);

      await service.update('user-1', 'tx-1', { amount: 80000 });

      // oldDelta = -50000, newDelta = -80000 => diff = -30000
      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { currentBalance: { increment: -30000 } },
      });
    });

    it('INCOME giảm amount nên trừ bớt đúng phần chênh lệch khỏi ví', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        walletId: 'wallet-1',
        type: 'INCOME',
        amount: 200000,
      } as any);
      prisma.transaction.update.mockResolvedValue({ id: 'tx-1' } as any);
      prisma.wallet.update.mockResolvedValue({} as any);

      await service.update('user-1', 'tx-1', { amount: 150000 });

      // oldDelta = 200000, newDelta = 150000 => diff = -50000
      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { currentBalance: { increment: -50000 } },
      });
    });

    it('nếu amount không đổi (diff = 0) thì KHÔNG được gọi wallet.update / $transaction', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        walletId: 'wallet-1',
        type: 'EXPENSE',
        amount: 50000,
      } as any);
      prisma.transaction.update.mockResolvedValue({ id: 'tx-1' } as any);

      await service.update('user-1', 'tx-1', {
        note: 'chỉ đổi ghi chú',
      });

      expect(prisma.wallet.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('nên validate categoryId mới nếu có truyền categoryId', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        walletId: 'wallet-1',
        type: 'EXPENSE',
        amount: 50000,
      } as any);
      prisma.category.findFirst.mockResolvedValue({
        id: 'category-2',
        type: 'EXPENSE',
      } as any);
      prisma.transaction.update.mockResolvedValue({ id: 'tx-1' } as any);

      await service.update('user-1', 'tx-1', {
        categoryId: 'category-2',
      });

      expect(prisma.category.findFirst).toHaveBeenCalled();
    });

    it('nên ném NotFoundException nếu giao dịch không thuộc user', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-1', 'tx-la', { amount: 10000 } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove - TRANSFER', () => {
    it('nên hoàn tác đúng cả 2 ví khi xoá giao dịch TRANSFER', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        walletId: 'wallet-1',
        toWalletId: 'wallet-2',
        type: 'TRANSFER',
        amount: 100000,
      } as any);
      prisma.transaction.update.mockResolvedValue({} as any);
      prisma.wallet.update.mockResolvedValue({} as any);

      const result = await service.remove('user-1', 'tx-1');

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { currentBalance: { increment: 100000 } },
      });
      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-2' },
        data: { currentBalance: { decrement: 100000 } },
      });
      expect(result).toEqual({ message: 'Xóa giao dịch thành công' });
    });
  });

  describe('findAll', () => {
    it('nên trả về data + meta phân trang đúng', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        { id: 'tx-1' },
        { id: 'tx-2' },
      ] as any);
      prisma.transaction.count.mockResolvedValue(5);

      const result = await service.findAll('user-1', {});

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 5,
        totalPages: 1,
      });
    });

    it('nên áp dụng đúng where clause khi có filter walletId/type/khoảng ngày/khoảng tiền', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);
      prisma.transaction.count.mockResolvedValue(0);

      await service.findAll('user-1', {
        walletId: 'wallet-1',
        type: 'EXPENSE',
        from: '2026-08-01',
        to: '2026-08-31',
        minAmount: 10000,
        maxAmount: 500000,
        page: 2,
        limit: 10,
      } as any);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            walletId: 'wallet-1',
            type: 'EXPENSE',
            date: {
              gte: new Date('2026-08-01'),
              lte: new Date('2026-08-31'),
            },
            amount: { gte: 10000, lte: 500000 },
          }),
          skip: 10, // (page 2 - 1) * limit 10
          take: 10,
        }),
      );
    });
  });

  describe('getAttachmentPath', () => {
    it('nên trả về đúng path khi transaction có attachmentUrl', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        attachmentUrl: '/uploads/abc.jpg',
      } as any);

      const result = await service.getAttachmentPath('user-1', 'tx-1');

      expect(result).toMatch(/uploads[\\/]abc\.jpg$/);
    });

    it('nên ném NotFoundException (ATTACHMENT_NOT_FOUND) nếu chưa có file đính kèm', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        attachmentUrl: null,
      } as any);

      await expect(service.getAttachmentPath('user-1', 'tx-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('nên ném NotFoundException nếu transaction không thuộc user', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);

      await expect(
        service.getAttachmentPath('user-1', 'tx-la'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
