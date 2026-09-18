import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TransactionType } from '@/generated/prisma/client';
import { ErrorCode } from '../../common/constants/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionsService } from './transactions.service';
import { FindTransactionsDto } from './dto/find-transactions.dto';

describe('TransactionsService - kiểm tra danh mục và bộ lọc', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: TransactionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new TransactionsService(prisma);
  });

  describe('create - kiểm tra danh mục', () => {
    const dto = {
      type: TransactionType.EXPENSE,
      walletId: 'wallet-1',
      categoryId: 'category-1',
      amount: 25000,
      date: '2026-08-20',
    };

    beforeEach(() => {
      prisma.wallet.findFirst.mockResolvedValue({ id: 'wallet-1' } as any);
    });

    it('nên từ chối danh mục không tồn tại hoặc không thể truy cập trước khi tạo giao dịch', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(service.create('user-1', dto)).rejects.toMatchObject({
        status: 400,
        response: { errorCode: ErrorCode.CATEGORY_NOT_FOUND },
      });
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'category-1',
          deletedAt: null,
          OR: [{ userId: 'user-1' }, { isSystem: true }],
        },
      });
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(prisma.wallet.update).not.toHaveBeenCalled();
    });

    it('nên từ chối danh mục sai loại giao dịch và không thay đổi số dư', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'category-1',
        type: TransactionType.INCOME,
      } as any);

      await expect(service.create('user-1', dto)).rejects.toMatchObject({
        status: 400,
        response: {
          errorCode: ErrorCode.TRANSACTION_CATEGORY_TYPE_MISMATCH,
        },
      });
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(prisma.wallet.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll - bộ lọc', () => {
    beforeEach(() => {
      prisma.transaction.findMany.mockResolvedValue([]);
      prisma.transaction.count.mockResolvedValue(0);
    });

    it.each([
      { name: 'không nhập amount', params: {}, amount: undefined },
      { name: 'minAmount=0', params: { minAmount: '0' }, amount: { gte: 0 } },
      { name: 'minAmount rỗng', params: { minAmount: '' }, amount: undefined },
      { name: 'maxAmount=0', params: { maxAmount: '0' }, amount: { lte: 0 } },
      { name: 'maxAmount rỗng', params: { maxAmount: '' }, amount: undefined },
      {
        name: 'minAmount âm',
        params: { minAmount: '-100' },
        amount: { gte: -100 },
      },
    ])('parse $name và tạo amount where đúng', async ({ params, amount }) => {
      const query = plainToInstance(FindTransactionsDto, params);
      expect(validateSync(query)).toHaveLength(0);

      await service.findAll('user-1', query);

      const expectedWhere = {
        userId: 'user-1',
        deletedAt: null,
        ...(amount ? { amount } : {}),
      };
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it('giữ validation lỗi cho amount không phải số', () => {
      const query = plainToInstance(FindTransactionsDto, {
        minAmount: 'không phải số',
      });
      expect(validateSync(query).map((error) => error.property)).toContain(
        'minAmount',
      );
    });

    it.each([
      {
        name: 'danh mục',
        query: { categoryId: 'category-1' },
        extraWhere: { categoryId: 'category-1' },
      },
      {
        name: 'chỉ ngày bắt đầu',
        query: { from: '2026-08-01' },
        extraWhere: { date: { gte: new Date('2026-08-01') } },
      },
      {
        name: 'chỉ ngày kết thúc',
        query: { to: '2026-08-31' },
        extraWhere: { date: { lte: new Date('2026-08-31') } },
      },
      {
        name: 'chỉ số tiền tối thiểu',
        query: { minAmount: 0 },
        extraWhere: { amount: { gte: 0 } },
      },
      {
        name: 'chỉ số tiền tối đa',
        query: { maxAmount: 50000 },
        extraWhere: { amount: { lte: 50000 } },
      },
      {
        name: 'danh mục kết hợp giới hạn ngày và số tiền',
        query: {
          categoryId: 'category-1',
          from: '2026-08-01',
          maxAmount: 50000,
        },
        extraWhere: {
          categoryId: 'category-1',
          date: { gte: new Date('2026-08-01') },
          amount: { lte: 50000 },
        },
      },
    ])(
      'nên áp dụng bộ lọc $name nhất quán cho danh sách và tổng số',
      async ({ query, extraWhere }) => {
        const expectedWhere = {
          userId: 'user-1',
          deletedAt: null,
          ...extraWhere,
        };

        await service.findAll('user-1', query);

        expect(prisma.transaction.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expectedWhere }),
        );
        expect(prisma.transaction.count).toHaveBeenCalledWith({
          where: expectedWhere,
        });
      },
    );
  });

  describe('findAllForExport - bộ lọc', () => {
    beforeEach(() => {
      prisma.transaction.findMany.mockResolvedValue([]);
    });

    it('nên xuất giao dịch theo danh mục, loại, ngày bắt đầu và số tiền tối thiểu', async () => {
      await service.findAllForExport('user-1', {
        categoryId: 'category-1',
        type: TransactionType.EXPENSE,
        from: '2026-08-01',
        minAmount: 0,
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          deletedAt: null,
          categoryId: 'category-1',
          type: TransactionType.EXPENSE,
          date: { gte: new Date('2026-08-01') },
          amount: { gte: 0 },
        },
        orderBy: { date: 'desc' },
        include: { wallet: true, category: true },
      });
    });

    it('nên xuất giao dịch trước ngày kết thúc và không vượt số tiền tối đa', async () => {
      await service.findAllForExport('user-1', {
        to: '2026-08-31',
        maxAmount: 50000,
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          deletedAt: null,
          date: { lte: new Date('2026-08-31') },
          amount: { lte: 50000 },
        },
        orderBy: { date: 'desc' },
        include: { wallet: true, category: true },
      });
    });
  });
});
