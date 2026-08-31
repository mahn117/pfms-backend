import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

export interface CategoryNode {
  id: string;
  name: string;
  type: string;
  icon: string | null;
  parentId: string | null;
  isSystem: boolean;
  children: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCategoryDto) {
    if (dto.parentId) {
      await this.assertValidParent(userId, dto.parentId, dto.type);
    }

    return this.prisma.category.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
        icon: dto.icon,
        parentId: dto.parentId,
      },
    });
  }

  async findAllFlat(userId: string) {
    return this.prisma.category.findMany({
      where: {
        deletedAt: null,
        OR: [{ userId }, { isSystem: true }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findTree(userId: string) {
    const flat = await this.findAllFlat(userId);
    return this.buildTree(flat);
  }

  buildTree(categories: Omit<CategoryNode, 'children'>[]): CategoryNode[] {
    const map = new Map<string, CategoryNode>();
    categories.forEach((c) => map.set(c.id, { ...c, children: [] }));

    const roots: CategoryNode[] = [];
    map.forEach((node) => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.findEditableOrThrow(userId, id);

    if (dto.parentId) {
      await this.assertValidParent(userId, dto.parentId, category.type);
      await this.assertNoCycle(id, dto.parentId);
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        icon: dto.icon,
        parentId: dto.parentId,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findEditableOrThrow(userId, id);

    const childrenCount = await this.prisma.category.count({
      where: { parentId: id, deletedAt: null },
    });
    if (childrenCount > 0) {
      throw new BadRequestException({
        errorCode: ErrorCode.INVALID_PARENT_CATEGORY,
        message:
          'Không thể xóa danh mục còn danh mục con. Hãy xóa/di chuyển danh mục con trước',
      });
    }

    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Xóa danh mục thành công' };
  }

  private async findEditableOrThrow(userId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException({
        errorCode: ErrorCode.CATEGORY_NOT_FOUND,
        message: 'Không tìm thấy danh mục',
      });
    }

    if (category.isSystem) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Không thể sửa/xóa danh mục hệ thống',
      });
    }

    if (category.userId !== userId) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Bạn không có quyền với danh mục này',
      });
    }

    return category;
  }

  private async assertValidParent(
    userId: string,
    parentId: string,
    type: string,
  ) {
    const parent = await this.prisma.category.findFirst({
      where: {
        id: parentId,
        deletedAt: null,
        OR: [{ userId }, { isSystem: true }],
      },
    });
    if (!parent) {
      throw new BadRequestException({
        errorCode: ErrorCode.INVALID_PARENT_CATEGORY,
        message:
          'Danh mục cha không tồn tại hoặc không thuộc quyền sở hữu của bạn',
      });
    }
    if (parent.type !== type) {
      throw new BadRequestException({
        errorCode: ErrorCode.CATEGORY_TYPE_MISMATCH,
        message:
          'Danh mục con phải cùng loại (INCOME/EXPENSE) với danh mục cha',
      });
    }
  }

  async assertNoCycle(categoryId: string, newParentId: string) {
    if (categoryId === newParentId) {
      throw new BadRequestException({
        errorCode: ErrorCode.CIRCULAR_CATEGORY_REFERENCE,
        message: 'Danh mục không thể là cha của chính nó',
      });
    }

    let currentId: string | null = newParentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === categoryId) {
        throw new BadRequestException({
          errorCode: ErrorCode.CIRCULAR_CATEGORY_REFERENCE,
          message: 'Thao tác này sẽ tạo vòng lặp trong cây danh mục',
        });
      }
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const parent: { parentId: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id: currentId },
          select: { parentId: true },
        });
      currentId = parent?.parentId ?? null;
    }
  }
}
