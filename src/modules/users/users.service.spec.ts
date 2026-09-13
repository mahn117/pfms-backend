import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaService>;
  let passwordHash: string;

  const userId = 'user-1';
  const currentPassword = 'OldPassword123';
  const newPassword = 'NewPassword123';

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(currentPassword, 4);
  });

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UsersService);
  });

  it('getMe trả hồ sơ đúng user và không lộ passwordHash', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      fullName: 'User A',
      passwordHash,
    } as any);

    await expect(service.getMe(userId)).resolves.toEqual({
      id: userId,
      email: 'user@example.com',
      fullName: 'User A',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: userId },
    });
  });

  it('getMe trả NOT_FOUND khi user không tồn tại', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getMe(userId)).rejects.toMatchObject({
      response: { errorCode: 'NOT_FOUND' },
    });
    await expect(service.getMe(userId)).rejects.toThrow(NotFoundException);
  });

  it('updateMe chỉ cập nhật trường hồ sơ được gửi và không lộ passwordHash', async () => {
    const dto = { fullName: 'Tên mới', locale: 'en' };
    prisma.user.update.mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      fullName: dto.fullName,
      locale: dto.locale,
      passwordHash,
    } as any);

    const result = await service.updateMe(userId, dto);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: dto,
    });
    expect(result).toMatchObject({
      id: userId,
      fullName: 'Tên mới',
      locale: 'en',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('changePassword trả NOT_FOUND khi user không tồn tại', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.changePassword(userId, { currentPassword, newPassword }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('changePassword từ chối mật khẩu cũ sai và không cập nhật dữ liệu', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      passwordHash,
    } as any);

    await expect(
      service.changePassword(userId, {
        currentPassword: 'WrongPassword123',
        newPassword,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('changePassword từ chối mật khẩu mới trùng mật khẩu cũ', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      passwordHash,
    } as any);

    await expect(
      service.changePassword(userId, {
        currentPassword,
        newPassword: currentPassword,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('changePassword hash mật khẩu mới và thu hồi refresh token còn hiệu lực', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      passwordHash,
    } as any);
    prisma.user.update.mockResolvedValue({} as any);
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
    prisma.$transaction.mockImplementation((operations: any) =>
      Promise.all(operations),
    );

    await expect(
      service.changePassword(userId, { currentPassword, newPassword }),
    ).resolves.toEqual({ message: 'Đổi mật khẩu thành công' });

    const update = prisma.user.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: userId });
    expect(
      await bcrypt.compare(newPassword, update.data.passwordHash as string),
    ).toBe(true);
    expect(
      await bcrypt.compare(currentPassword, update.data.passwordHash as string),
    ).toBe(false);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
