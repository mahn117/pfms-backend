import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not defined in environment variables.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  console.log('Start seeding...');

  // 1. Seed danh mục mặc định hệ thống (userId = null)
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
    {
      name: 'Giáo dục',
      icon: '📚',
      children: [],
    },
    {
      name: 'Khác',
      icon: '📦',
      children: [],
    },
  ];

  const incomeCategories = [
    { name: 'Lương', icon: '💰', children: [] },
    { name: 'Thưởng', icon: '🎁', children: [] },
    { name: 'Đầu tư', icon: '📈', children: [] },
    { name: 'Khác', icon: '📥', children: [] },
  ];

  for (const cat of expenseCategories) {
    const parent = await prisma.category.create({
      data: {
        name: cat.name,
        icon: cat.icon,
        type: 'EXPENSE',
        isSystem: true,
        userId: null,
      },
    });

    for (const childName of cat.children) {
      await prisma.category.create({
        data: {
          name: childName,
          type: 'EXPENSE',
          isSystem: true,
          userId: null,
          parentId: parent.id,
        },
      });
    }
  }

  for (const cat of incomeCategories) {
    await prisma.category.create({
      data: {
        name: cat.name,
        icon: cat.icon,
        type: 'INCOME',
        isSystem: true,
        userId: null,
      },
    });
  }

  console.log('Seeded system categories.');

  // 2. Seed 1 user test
  const passwordHash = await bcrypt.hash('Test@12345', 10);

  const testUser = await prisma.user.create({
    data: {
      email: 'test.user@pfms.local',
      passwordHash,
      fullName: 'Test User',
      role: 'USER',
    },
  });

  console.log(`Seeded test user: ${testUser.email}`);

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
