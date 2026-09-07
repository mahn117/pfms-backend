import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { GoalStatus } from '@/generated/prisma/client';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { ContributeGoalDto } from './dto/contribute-goal.dto';

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateGoalDto) {
    return this.prisma.goal.create({
      data: {
        userId,
        name: dto.name,
        targetAmount: dto.targetAmount,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    return this.findOwnedOrThrow(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateGoalDto) {
    const existing = await this.findOwnedOrThrow(userId, id);

    if (
      dto.targetAmount !== undefined &&
      dto.targetAmount < Number(existing.currentAmount)
    ) {
      throw new BadRequestException({
        errorCode: ErrorCode.GOAL_TARGET_LESS_THAN_CURRENT,
        message: 'targetAmount mới không được nhỏ hơn currentAmount hiện tại',
      });
    }

    return this.prisma.goal.update({
      where: { id },
      data: {
        name: dto.name,
        targetAmount: dto.targetAmount,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOwnedOrThrow(userId, id);

    await this.prisma.goal.delete({ where: { id } });

    return { message: 'Xóa mục tiêu thành công' };
  }

  async contribute(userId: string, id: string, dto: ContributeGoalDto) {
    const existing = await this.findOwnedOrThrow(userId, id);

    if (existing.status !== GoalStatus.IN_PROGRESS) {
      throw new BadRequestException({
        errorCode: ErrorCode.GOAL_ALREADY_FINISHED,
        message: 'Mục tiêu đã hoàn thành hoặc đã bị huỷ, không thể nạp thêm',
      });
    }

    const newCurrentAmount = Number(existing.currentAmount) + dto.amount;
    const isCompleted = newCurrentAmount >= Number(existing.targetAmount);

    return this.prisma.goal.update({
      where: { id },
      data: {
        currentAmount: { increment: dto.amount },
        status: isCompleted ? GoalStatus.COMPLETED : undefined,
      },
    });
  }

  private async findOwnedOrThrow(userId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
    });

    if (!goal) {
      throw new NotFoundException({
        errorCode: ErrorCode.GOAL_NOT_FOUND,
        message: 'Không tìm thấy mục tiêu',
      });
    }

    return goal;
  }
}
