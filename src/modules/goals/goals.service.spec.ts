import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { GoalsService } from './goals.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('GoalsService', () => {
  let service: GoalsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GoalsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(GoalsService);
  });

  describe('contribute', () => {
    it('nên cộng dồn currentAmount đúng qua nhiều lần contribute', async () => {
      prisma.goal.findFirst.mockResolvedValue({
        id: 'goal-1',
        userId: 'user-1',
        targetAmount: 1000000,
        currentAmount: 200000,
        status: 'IN_PROGRESS',
      } as any);
      prisma.goal.update.mockResolvedValue({} as any);

      await service.contribute('user-1', 'goal-1', { amount: 300000 });

      expect(prisma.goal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: {
          currentAmount: { increment: 300000 },
          status: undefined,
        },
      });
    });

    it('nên tự động chuyển status = COMPLETED khi currentAmount đạt targetAmount', async () => {
      prisma.goal.findFirst.mockResolvedValue({
        id: 'goal-1',
        userId: 'user-1',
        targetAmount: 1000000,
        currentAmount: 800000,
        status: 'IN_PROGRESS',
      } as any);
      prisma.goal.update.mockResolvedValue({} as any);

      await service.contribute('user-1', 'goal-1', { amount: 200000 });

      expect(prisma.goal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: {
          currentAmount: { increment: 200000 },
          status: 'COMPLETED',
        },
      });
    });

    it('nên đánh dấu COMPLETED khi contribute vượt quá targetAmount', async () => {
      prisma.goal.findFirst.mockResolvedValue({
        id: 'goal-1',
        userId: 'user-1',
        targetAmount: 1000000,
        currentAmount: 900000,
        status: 'IN_PROGRESS',
      } as any);
      prisma.goal.update.mockResolvedValue({} as any);

      await service.contribute('user-1', 'goal-1', { amount: 500000 });

      expect(prisma.goal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('nên ném BadRequestException nếu goal đã COMPLETED', async () => {
      prisma.goal.findFirst.mockResolvedValue({
        id: 'goal-1',
        userId: 'user-1',
        targetAmount: 1000000,
        currentAmount: 1000000,
        status: 'COMPLETED',
      } as any);

      await expect(
        service.contribute('user-1', 'goal-1', { amount: 100000 }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.goal.update).not.toHaveBeenCalled();
    });

    it('nên ném BadRequestException nếu goal đã CANCELLED', async () => {
      prisma.goal.findFirst.mockResolvedValue({
        id: 'goal-1',
        userId: 'user-1',
        targetAmount: 1000000,
        currentAmount: 500000,
        status: 'CANCELLED',
      } as any);

      await expect(
        service.contribute('user-1', 'goal-1', { amount: 100000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('nên ném NotFoundException nếu goal không thuộc user', async () => {
      prisma.goal.findFirst.mockResolvedValue(null);

      await expect(
        service.contribute('user-1', 'goal-cua-user-2', { amount: 100000 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('nên ném BadRequestException nếu targetAmount mới < currentAmount hiện tại', async () => {
      prisma.goal.findFirst.mockResolvedValue({
        id: 'goal-1',
        userId: 'user-1',
        targetAmount: 1000000,
        currentAmount: 700000,
        status: 'IN_PROGRESS',
      } as any);

      await expect(
        service.update('user-1', 'goal-1', { targetAmount: 500000 }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.goal.update).not.toHaveBeenCalled();
    });

    it('nên cập nhật thành công nếu targetAmount mới >= currentAmount', async () => {
      prisma.goal.findFirst.mockResolvedValue({
        id: 'goal-1',
        userId: 'user-1',
        targetAmount: 1000000,
        currentAmount: 700000,
        status: 'IN_PROGRESS',
      } as any);
      prisma.goal.update.mockResolvedValue({ id: 'goal-1' } as any);

      await service.update('user-1', 'goal-1', { targetAmount: 1500000 });

      expect(prisma.goal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: {
          name: undefined,
          targetAmount: 1500000,
          deadline: undefined,
        },
      });
    });
  });

  describe('findOne - quyền sở hữu', () => {
    it('nên ném NotFoundException nếu goal không thuộc user', async () => {
      prisma.goal.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('user-1', 'goal-cua-user-2'),
      ).rejects.toThrow(NotFoundException);
    });

    it('nên trả về goal nếu đúng chủ sở hữu', async () => {
      const goal = { id: 'goal-1', userId: 'user-1' };
      prisma.goal.findFirst.mockResolvedValue(goal as any);

      const result = await service.findOne('user-1', 'goal-1');
      expect(result).toEqual(goal);
    });
  });

  describe('remove', () => {
    it('nên xoá cứng goal (không có deletedAt trong schema)', async () => {
      prisma.goal.findFirst.mockResolvedValue({
        id: 'goal-1',
        userId: 'user-1',
      } as any);
      prisma.goal.delete.mockResolvedValue({} as any);

      await service.remove('user-1', 'goal-1');

      expect(prisma.goal.delete).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
      });
    });
  });

  describe('create', () => {
    it('nên tạo goal thành công kèm deadline khi có truyền', async () => {
      prisma.goal.create.mockResolvedValue({ id: 'goal-1' } as any);

      await service.create('user-1', {
        name: 'Mua xe máy',
        targetAmount: 1000000,
        deadline: '2026-12-31',
      });

      expect(prisma.goal.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          name: 'Mua xe máy',
          targetAmount: 1000000,
          deadline: new Date('2026-12-31'),
        },
      });
    });

    it('nên tạo goal thành công với deadline = undefined khi không truyền', async () => {
      prisma.goal.create.mockResolvedValue({ id: 'goal-1' } as any);

      await service.create('user-1', {
        name: 'Mua xe máy',
        targetAmount: 1000000,
      });

      expect(prisma.goal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ deadline: undefined }),
      });
    });
  });

  describe('findAll', () => {
    it('nên query đúng theo userId, sắp xếp mới nhất trước', async () => {
      prisma.goal.findMany.mockResolvedValue([]);

      await service.findAll('user-1');

      expect(prisma.goal.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
