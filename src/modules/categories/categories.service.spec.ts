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

  describe('create', () => {
    it('nên tạo category gốc thành công khi KHÔNG có parentId (không validate cha)', async () => {
      prisma.category.create.mockResolvedValue({ id: 'cat-1' } as any);

      await service.create('user-1', {
        name: 'Ăn uống',
        type: 'EXPENSE',
      } as any);

      expect(prisma.category.findFirst).not.toHaveBeenCalled();
      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            name: 'Ăn uống',
            type: 'EXPENSE',
            parentId: undefined,
          }),
        }),
      );
    });

    it('nên tạo category con thành công khi parentId hợp lệ, cùng loại', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'parent-1',
        type: 'EXPENSE',
      } as any);
      prisma.category.create.mockResolvedValue({ id: 'cat-2' } as any);

      await service.create('user-1', {
        name: 'Ăn sáng',
        type: 'EXPENSE',
        parentId: 'parent-1',
      } as any);

      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: 'parent-1' }),
        }),
      );
    });

    it('nên ném BadRequestException nếu parentId không tồn tại/không thuộc user', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          name: 'Ăn sáng',
          type: 'EXPENSE',
          parentId: 'parent-la',
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('nên ném BadRequestException nếu type của cha khác type con', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'parent-1',
        type: 'INCOME',
      } as any);

      await expect(
        service.create('user-1', {
          name: 'Ăn sáng',
          type: 'EXPENSE',
          parentId: 'parent-1',
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.category.create).not.toHaveBeenCalled();
    });
  });

  describe('findAllFlat', () => {
    it('nên query đúng where: deletedAt null, thuộc user hoặc isSystem', async () => {
      prisma.category.findMany.mockResolvedValue([]);

      await service.findAllFlat('user-1');

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            OR: [{ userId: 'user-1' }, { isSystem: true }],
          },
        }),
      );
    });
  });

  describe('findTree', () => {
    it('nên lấy danh sách phẳng rồi dựng thành cây', async () => {
      prisma.category.findMany.mockResolvedValue([
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
      ] as any);

      const result = await service.findTree('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
    });
  });

  describe('update - thành công', () => {
    it('nên update thành công khi category thuộc đúng user, không đổi parentId', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        userId: 'user-1',
        isSystem: false,
        type: 'EXPENSE',
        deletedAt: null,
      } as any);
      prisma.category.update.mockResolvedValue({ id: 'cat-1' } as any);

      await service.update('user-1', 'cat-1', { name: 'Tên mới' });

      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1' },
          data: expect.objectContaining({ name: 'Tên mới' }),
        }),
      );
    });

    it('nên validate parent mới + kiểm tra cycle khi đổi parentId', async () => {
      prisma.category.findFirst
        .mockResolvedValueOnce({
          id: 'cat-1',
          userId: 'user-1',
          isSystem: false,
          type: 'EXPENSE',
          deletedAt: null,
        } as any) // findEditableOrThrow
        .mockResolvedValueOnce({ id: 'parent-2', type: 'EXPENSE' } as any); // assertValidParent
      prisma.category.findUnique.mockResolvedValue({ parentId: null } as any); // assertNoCycle
      prisma.category.update.mockResolvedValue({ id: 'cat-1' } as any);

      await service.update('user-1', 'cat-1', {
        parentId: 'parent-2',
      });

      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: 'parent-2' }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('nên soft-delete thành công khi category không còn con', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        userId: 'user-1',
        isSystem: false,
        type: 'EXPENSE',
        deletedAt: null,
      } as any);
      prisma.category.count.mockResolvedValue(0);
      prisma.category.update.mockResolvedValue({} as any);

      const result = await service.remove('user-1', 'cat-1');

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result).toEqual({ message: 'Xóa danh mục thành công' });
    });

    it('nên ném BadRequestException nếu category còn danh mục con', async () => {
      prisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        userId: 'user-1',
        isSystem: false,
        type: 'EXPENSE',
        deletedAt: null,
      } as any);
      prisma.category.count.mockResolvedValue(2);

      await expect(service.remove('user-1', 'cat-1')).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.category.update).not.toHaveBeenCalled();
    });
  });
});
