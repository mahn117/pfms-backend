import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AuthRateLimitGuard } from '../src/modules/auth/auth-rate-limit.guard';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { OtpDeliveryService } from '../src/modules/notifications/otp-delivery.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

describe('Forgot-password OTP delivery (HTTP)', () => {
  let app: INestApplication;
  const existingEmail = 'existing@example.com';
  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { email: string } }) =>
        where.email === existingEmail
          ? Promise.resolve({ id: 'user-1', email: existingEmail })
          : Promise.resolve(null),
      ),
    },
  };
  const redis = {
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const delivery = {
    sendPasswordResetOtp: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: OtpDeliveryService, useValue: delivery },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: {} },
      ],
    })
      .overrideGuard(AuthRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the same response but only delivers for an existing account', async () => {
    const existing = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: existingEmail })
      .expect(200);
    const nonexistent = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nonexistent@example.com' })
      .expect(200);

    expect(nonexistent.body).toEqual(existing.body);
    expect(delivery.sendPasswordResetOtp).toHaveBeenCalledTimes(1);
    expect(delivery.sendPasswordResetOtp).toHaveBeenCalledWith({
      email: existingEmail,
      otp: expect.stringMatching(/^\d{6}$/),
      expiresInSeconds: 300,
    });
    expect(redis.set).toHaveBeenCalledTimes(1);
  });
});
