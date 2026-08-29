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
});
