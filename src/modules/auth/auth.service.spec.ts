import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: DeepMockProxy<PrismaService>;
  let jwtService: JwtService;
  let redisService: { set: jest.Mock; get: jest.Mock; del: jest.Mock };

  const configValues: Record<string, string> = {
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_ACCESS_EXPIRES: '15m',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_REFRESH_EXPIRES: '7d',
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('signed-token'),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
            getOrThrow: jest.fn((key: string) => configValues[key]),
          },
        },
        {
          provide: RedisService,
          useValue: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    jwtService = module.get(JwtService);
    redisService = module.get(RedisService);
  });

  describe('register', () => {
    it('nên hash mật khẩu và tạo user mới', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash: 'hashed',
      } as any);
      prisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await service.register({
        email: 'a@b.com',
        password: 'Password123',
        fullName: 'A',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'a@b.com' }),
        }),
      );
      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
    });

    it('nên ném ConflictException nếu email đã tồn tại', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' } as any);

      await expect(
        service.register({
          email: 'a@b.com',
          password: 'Password123',
          fullName: 'A',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('nên đăng nhập thành công khi mật khẩu đúng', async () => {
      const passwordHash = await bcrypt.hash('Password123', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash,
      } as any);
      prisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await service.login({
        email: 'a@b.com',
        password: 'Password123',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('nên ném UnauthorizedException khi sai mật khẩu', async () => {
      const passwordHash = await bcrypt.hash('Password123', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash,
      } as any);

      await expect(
        service.login({ email: 'a@b.com', password: 'Wrong123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('nên xoay vòng refresh token hợp lệ', async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({
        sub: 'user-1',
        email: 'a@b.com',
      });
      prisma.refreshToken.findFirst.mockResolvedValue({ id: 'rt-1' } as any);
      prisma.refreshToken.update.mockResolvedValue({} as any);
      prisma.refreshToken.create.mockResolvedValue({} as any);

      const result = await service.refresh({ refreshToken: 'old-token' });

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(result).toHaveProperty('accessToken');
    });

    it('nên ném UnauthorizedException nếu token không còn trong DB', async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({
        sub: 'user-1',
        email: 'a@b.com',
      });
      prisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'old-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('nên trả về message chung và KHÔNG gọi Redis nếu email không tồn tại (chống dò email)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'khong-ton-tai@b.com',
      });

      expect(result).toEqual({ message: 'Nếu email tồn tại, OTP đã được gửi' });
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('nên sinh OTP, hash và lưu vào Redis với đúng key + TTL khi email tồn tại', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
      } as any);

      const result = await service.forgotPassword({ email: 'a@b.com' });

      expect(redisService.set).toHaveBeenCalledWith(
        'otp:reset-password:user-1',
        expect.any(String),
        300, // 5 * 60
      );
      expect(result).toEqual({ message: 'Nếu email tồn tại, OTP đã được gửi' });
    });
  });

  describe('resetPassword', () => {
    it('nên ném UnauthorizedException nếu email không tồn tại', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          email: 'khong-ton-tai@b.com',
          otp: '123456',
          newPassword: 'NewPassword123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('nên ném UnauthorizedException nếu không tìm thấy OTP trong Redis (hết hạn/chưa từng gửi)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
      } as any);
      redisService.get.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          email: 'a@b.com',
          otp: '123456',
          newPassword: 'NewPassword123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('nên ném UnauthorizedException nếu OTP sai', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
      } as any);
      const correctHash = await bcrypt.hash('654321', 10);
      redisService.get.mockResolvedValue(correctHash);

      await expect(
        service.resetPassword({
          email: 'a@b.com',
          otp: '123456', // sai
          newPassword: 'NewPassword123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('nên đổi mật khẩu, thu hồi refresh token và xoá OTP khỏi Redis khi OTP đúng', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
      } as any);
      const correctHash = await bcrypt.hash('123456', 10);
      redisService.get.mockResolvedValue(correctHash);
      prisma.$transaction.mockImplementation((ops: any) => Promise.all(ops));
      prisma.user.update.mockResolvedValue({} as any);
      prisma.refreshToken.updateMany.mockResolvedValue({} as any);

      const result = await service.resetPassword({
        email: 'a@b.com',
        otp: '123456',
        newPassword: 'NewPassword123',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', revokedAt: null },
        }),
      );
      expect(redisService.del).toHaveBeenCalledWith(
        'otp:reset-password:user-1',
      );
      expect(result).toEqual({ message: 'Đặt lại mật khẩu thành công' });
    });
  });

  describe('logout', () => {
    it('nên thu hồi đúng refresh token theo userId + tokenHash', async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({
        sub: 'user-1',
        email: 'a@b.com',
      });
      prisma.refreshToken.updateMany.mockResolvedValue({} as any);

      const result = await service.logout({ refreshToken: 'some-token' });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            revokedAt: null,
          }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(result).toEqual({ message: 'Đăng xuất thành công' });
    });

    it('nên ném UnauthorizedException nếu refreshToken không verify được', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(
        service.logout({ refreshToken: 'token-loi' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
