import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(CategoriesService);
  });

  describe('buildTree', () => {
    it('nên dựng đúng cấu trúc cây từ danh sách phẳng', () => {
      const flat = [
        {
          id: '1',
          name: 'Ăn uống',
          type: 'EXPENSE',
          icon: null,
          parentId: null,
          isSystem: true,
        },
        {
          id: '2',
          name: 'Ăn sáng',
          type: 'EXPENSE',
          icon: null,
          parentId: '1',
          isSystem: true,
        },
        {
          id: '3',
          name: 'Đi chợ',
          type: 'EXPENSE',
          icon: null,
          parentId: '1',
          isSystem: true,
        },
        {
          id: '4',
          name: 'Lương',
          type: 'INCOME',
          icon: null,
          parentId: null,
          isSystem: true,
        },
      ];

      const tree = service.buildTree(flat);

      expect(tree).toHaveLength(2);
      const anUong = tree.find((n) => n.id === '1')!;
      expect(anUong.children).toHaveLength(2);
      expect(anUong.children.map((c) => c.id).sort()).toEqual(['2', '3']);
    });

    it('nếu parentId trỏ đến id không tồn tại trong danh sách thì coi như root', () => {
      const flat = [
        {
          id: '1',
          name: 'Mồ côi',
          type: 'EXPENSE',
          icon: null,
          parentId: 'not-exist',
          isSystem: false,
        },
      ];
      const tree = service.buildTree(flat);
      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe('1');
    });
  });

  describe('assertNoCycle', () => {
    it('nên ném lỗi khi set parentId = chính nó', async () => {
      await expect(service.assertNoCycle('a', 'a')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('nên ném lỗi khi tạo vòng lặp gián tiếp (A -> B -> C -> A)', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce({ parentId: 'B' } as any)
        .mockResolvedValueOnce({ parentId: 'A' } as any);

      await expect(service.assertNoCycle('A', 'C')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('không ném lỗi khi không có vòng lặp', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({
        parentId: null,
      } as any);
      await expect(service.assertNoCycle('B', 'A')).resolves.toBeUndefined();
    });
  });

  describe('update - bảo vệ category hệ thống', () => {
    it('nên ném ForbiddenException khi sửa category hệ thống (userId = null)', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'sys-1',
        userId: null,
        isSystem: true,
        type: 'EXPENSE',
        deletedAt: null,
      } as any);

      await expect(
        service.update('user-1', 'sys-1', { name: 'Thử sửa' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('nên ném ForbiddenException khi sửa category của user khác', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        userId: 'user-2',
        isSystem: false,
        type: 'EXPENSE',
        deletedAt: null,
      } as any);

      await expect(
        service.update('user-1', 'cat-1', { name: 'Thử sửa' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('nên ném NotFoundException khi category không tồn tại', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-1', 'not-exist', { name: 'Thử sửa' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
