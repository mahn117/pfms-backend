import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  CategoryType,
  PrismaClient,
  Role,
  TransactionType,
  WalletType,
} from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not defined in environment variables.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const TEST_USER_EMAIL = 'test.user@pfms.local';
const TEST_USER_PASSWORD = 'Test@12345';

const DEMO_IDS = {
  cashWallet: '10000000-0000-4000-8000-000000000001',
  bankWallet: '10000000-0000-4000-8000-000000000002',
  salaryTransaction: '20000000-0000-4000-8000-000000000001',
  foodTransaction: '20000000-0000-4000-8000-000000000002',
  transportTransaction: '20000000-0000-4000-8000-000000000003',
  transferTransaction: '20000000-0000-4000-8000-000000000004',
} as const;

const expenseCategories = [
  {
    name: 'Ăn uống',
    icon: '🍔',
    children: ['Ăn sáng', 'Ăn trưa', 'Ăn tối', 'Đi chợ', 'Cà phê'],
  },
  {
    name: 'Di chuyển',
    icon: '🚗',
    children: ['Xăng xe', 'Grab/Taxi', 'Gửi xe', 'Bảo dưỡng'],
  },
  {
    name: 'Nhà ở',
    icon: '🏠',
    children: ['Tiền nhà', 'Điện', 'Nước', 'Internet'],
  },
  {
    name: 'Mua sắm',
    icon: '🛍️',
    children: ['Quần áo', 'Đồ gia dụng'],
  },
  {
    name: 'Giải trí',
    icon: '🎮',
    children: ['Phim ảnh', 'Du lịch'],
  },
  {
    name: 'Sức khỏe',
    icon: '💊',
    children: ['Khám bệnh', 'Thuốc'],
  },
  { name: 'Giáo dục', icon: '📚', children: [] },
  { name: 'Khác', icon: '📦', children: [] },
] as const;

const incomeCategories = [
  { name: 'Lương', icon: '💰' },
  { name: 'Thưởng', icon: '🎁' },
  { name: 'Đầu tư', icon: '📈' },
  { name: 'Khác', icon: '📥' },
] as const;

async function main() {
  console.log('Start seeding...');

  const passwordHash = await bcrypt.hash(TEST_USER_PASSWORD, 10);
  const now = new Date();
  const demoDate = (hour: number) =>
    new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour),
    );

  const result = await prisma.$transaction(
    async (tx) => {
      const categoryIds = new Map<string, string>();

      const findOrCreateSystemCategory = async (
        name: string,
        type: CategoryType,
        icon: string | null,
        parentId: string | null,
      ) => {
        const existing = await tx.category.findFirst({
          where: {
            name,
            type,
            parentId,
            userId: null,
            isSystem: true,
            deletedAt: null,
          },
          orderBy: { createdAt: 'asc' },
        });

        if (existing) {
          return tx.category.update({
            where: { id: existing.id },
            data: { icon },
          });
        }

        return tx.category.create({
          data: {
            name,
            type,
            icon,
            parentId,
            userId: null,
            isSystem: true,
          },
        });
      };

      for (const category of expenseCategories) {
        const parent = await findOrCreateSystemCategory(
          category.name,
          CategoryType.EXPENSE,
          category.icon,
          null,
        );
        categoryIds.set(`EXPENSE:${category.name}`, parent.id);

        for (const childName of category.children) {
          await findOrCreateSystemCategory(
            childName,
            CategoryType.EXPENSE,
            null,
            parent.id,
          );
        }
      }

      for (const category of incomeCategories) {
        const created = await findOrCreateSystemCategory(
          category.name,
          CategoryType.INCOME,
          category.icon,
          null,
        );
        categoryIds.set(`INCOME:${category.name}`, created.id);
      }

      const testUser = await tx.user.upsert({
        where: { email: TEST_USER_EMAIL },
        update: {
          passwordHash,
          fullName: 'Test User',
          role: Role.USER,
          isActive: true,
        },
        create: {
          email: TEST_USER_EMAIL,
          passwordHash,
          fullName: 'Test User',
          role: Role.USER,
        },
      });

      const cashWallet = await tx.wallet.upsert({
        where: { id: DEMO_IDS.cashWallet },
        update: {
          userId: testUser.id,
          name: 'Tiền mặt',
          type: WalletType.CASH,
          initialBalance: 1_000_000,
          isArchived: false,
          deletedAt: null,
        },
        create: {
          id: DEMO_IDS.cashWallet,
          userId: testUser.id,
          name: 'Tiền mặt',
          type: WalletType.CASH,
          initialBalance: 1_000_000,
          currentBalance: 1_000_000,
        },
      });

      const bankWallet = await tx.wallet.upsert({
        where: { id: DEMO_IDS.bankWallet },
        update: {
          userId: testUser.id,
          name: 'Tài khoản ngân hàng',
          type: WalletType.BANK,
          initialBalance: 5_000_000,
          isArchived: false,
          deletedAt: null,
        },
        create: {
          id: DEMO_IDS.bankWallet,
          userId: testUser.id,
          name: 'Tài khoản ngân hàng',
          type: WalletType.BANK,
          initialBalance: 5_000_000,
          currentBalance: 5_000_000,
        },
      });

      const demoTransactions = [
        {
          id: DEMO_IDS.salaryTransaction,
          walletId: bankWallet.id,
          toWalletId: null,
          categoryId: categoryIds.get('INCOME:Lương')!,
          type: TransactionType.INCOME,
          amount: 15_000_000,
          date: demoDate(8),
          note: 'Lương tháng - dữ liệu demo',
        },
        {
          id: DEMO_IDS.foodTransaction,
          walletId: cashWallet.id,
          toWalletId: null,
          categoryId: categoryIds.get('EXPENSE:Ăn uống')!,
          type: TransactionType.EXPENSE,
          amount: 120_000,
          date: demoDate(10),
          note: 'Ăn uống - dữ liệu demo',
        },
        {
          id: DEMO_IDS.transportTransaction,
          walletId: cashWallet.id,
          toWalletId: null,
          categoryId: categoryIds.get('EXPENSE:Di chuyển')!,
          type: TransactionType.EXPENSE,
          amount: 80_000,
          date: demoDate(12),
          note: 'Di chuyển - dữ liệu demo',
        },
        {
          id: DEMO_IDS.transferTransaction,
          walletId: bankWallet.id,
          toWalletId: cashWallet.id,
          categoryId: null,
          type: TransactionType.TRANSFER,
          amount: 2_000_000,
          date: demoDate(14),
          note: 'Rút tiền mặt - dữ liệu demo',
        },
      ] as const;

      for (const transaction of demoTransactions) {
        const data = {
          userId: testUser.id,
          walletId: transaction.walletId,
          toWalletId: transaction.toWalletId,
          categoryId: transaction.categoryId,
          goalId: null,
          type: transaction.type,
          amount: transaction.amount,
          date: transaction.date,
          note: transaction.note,
          attachmentUrl: null,
          deletedAt: null,
        };

        await tx.transaction.upsert({
          where: { id: transaction.id },
          update: data,
          create: { id: transaction.id, ...data },
        });
      }

      const walletIds = [cashWallet.id, bankWallet.id];
      const activeTransactions = await tx.transaction.findMany({
        where: {
          deletedAt: null,
          OR: [
            { walletId: { in: walletIds } },
            { toWalletId: { in: walletIds } },
          ],
        },
      });

      const balances = new Map<string, number>([
        [cashWallet.id, Number(cashWallet.initialBalance)],
        [bankWallet.id, Number(bankWallet.initialBalance)],
      ]);

      for (const transaction of activeTransactions) {
        const amount = Number(transaction.amount);

        if (balances.has(transaction.walletId)) {
          const current = balances.get(transaction.walletId)!;
          const delta =
            transaction.type === TransactionType.INCOME
              ? amount
              : transaction.type === TransactionType.ADJUSTMENT
                ? amount
                : -amount;
          balances.set(transaction.walletId, current + delta);
        }

        if (
          transaction.type === TransactionType.TRANSFER &&
          transaction.toWalletId &&
          balances.has(transaction.toWalletId)
        ) {
          balances.set(
            transaction.toWalletId,
            balances.get(transaction.toWalletId)! + amount,
          );
        }
      }

      await Promise.all(
        walletIds.map((walletId) =>
          tx.wallet.update({
            where: { id: walletId },
            data: { currentBalance: balances.get(walletId)! },
          }),
        ),
      );

      return {
        email: testUser.email,
        categoryCount:
          expenseCategories.reduce(
            (total, category) => total + 1 + category.children.length,
            0,
          ) + incomeCategories.length,
        transactionCount: demoTransactions.length,
        wallets: [
          { name: cashWallet.name, balance: balances.get(cashWallet.id)! },
          { name: bankWallet.name, balance: balances.get(bankWallet.id)! },
        ],
      };
    },
    { timeout: 20_000 },
  );

  console.log(`Seeded system categories: ${result.categoryCount}.`);
  console.log(`Seeded test user: ${result.email}`);
  console.log(`Seeded demo transactions: ${result.transactionCount}.`);
  for (const wallet of result.wallets) {
    console.log(`Seeded wallet: ${wallet.name} (${wallet.balance}).`);
  }
  console.log('Seeding finished.');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
