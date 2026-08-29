import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy người dùng',
      });
    }
    return this.sanitize(user);
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
    return this.sanitize(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy người dùng',
      });
    }

    const isMatch = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isMatch) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.WRONG_CURRENT_PASSWORD,
        message: 'Mật khẩu hiện tại không đúng',
      });
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException({
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
      });
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Đổi mật khẩu thành công' };
  }

  private sanitize(user: { passwordHash: string; [key: string]: unknown }) {
    const rest: Record<string, unknown> = { ...user };
    delete rest.passwordHash;
    return rest;
  }
}
