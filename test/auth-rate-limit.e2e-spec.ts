import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthRateLimitGuard } from '../src/modules/auth/auth-rate-limit.guard';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { RedisService } from '../src/redis/redis.service';

@Controller('probe')
class ProbeController {
  @Get()
  get() {
    return { ok: true };
  }
}

describe('Auth rate limiting (HTTP)', () => {
  let app: INestApplication;
  let now = 0;
  const counters = new Map<string, { count: number; expiresAt: number }>();
  const auth = {
    login: jest.fn().mockResolvedValue({ accessToken: 'token' }),
    forgotPassword: jest
      .fn()
      .mockResolvedValue({ message: 'Nếu email tồn tại, OTP đã được gửi' }),
    register: jest.fn().mockResolvedValue({ accessToken: 'token' }),
    refresh: jest.fn(),
    logout: jest.fn(),
    resetPassword: jest.fn(),
  };
  const redis = {
    consumeRateLimits: jest.fn(
      (limits: { key: string; limit: number; windowMs: number }[]) => {
        const current = limits.map((limit) => {
          const stored = counters.get(limit.key);
          return stored && stored.expiresAt > now ? stored : undefined;
        });
        const retry = Math.max(
          0,
          ...limits.map((limit, index) =>
            (current[index]?.count ?? 0) >= limit.limit
              ? current[index]!.expiresAt - now
              : 0,
          ),
        );
        if (retry) return retry;
        limits.forEach((limit, index) => {
          counters.set(limit.key, {
            count: (current[index]?.count ?? 0) + 1,
            expiresAt: current[index]?.expiresAt ?? now + limit.windowMs,
          });
        });
        return 0;
      },
    ),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController, ProbeController],
      providers: [
        AuthRateLimitGuard,
        { provide: AuthService, useValue: auth },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  beforeEach(() => {
    now = 0;
    counters.clear();
    redis.consumeRateLimits.mockClear();
    auth.login.mockClear();
    auth.forgotPassword.mockClear();
    auth.register.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (route: string, email = 'user@example.com') =>
    request(app.getHttpServer())
      .post(`/api/v1/auth/${route}`)
      .send({ email, password: 'Password123', fullName: 'User' });

  it.each([
    ['login', 5, 200],
    ['forgot-password', 3, 200],
    ['register', 5, 201],
  ])(
    '%s cho phép dưới ngưỡng và trả 429 đúng format',
    async (route, limit, successStatus) => {
      for (let i = 0; i < Number(limit); i++) {
        const result = await post(String(route)).expect(Number(successStatus));
        expect(result.body.success).toBe(true);
      }
      const blocked = await post(String(route)).expect(429);
      expect(blocked.body).toMatchObject({
        success: false,
        statusCode: 429,
        errorCode: 'RATE_LIMIT_EXCEEDED',
        path: `/api/v1/auth/${route}`,
      });
      expect(blocked.body).toHaveProperty('timestamp');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(JSON.stringify(blocked.body)).not.toContain('user@example.com');
    },
  );

  it('tách bucket giữa các route và hết hạn đúng cửa sổ', async () => {
    for (let i = 0; i < 3; i++) await post('forgot-password').expect(200);
    await post('forgot-password').expect(429);
    await post('login').expect(200);
    await post('register').expect(201);
    now += 15 * 60_000 + 1;
    await post('forgot-password').expect(200);
  });

  it.each([
    ['login', 20, 'WrongPassword123'],
    ['forgot-password', 10, 'Password123'],
  ])(
    '%s áp dụng hạn mức IP khi thử nhiều email',
    async (route, limit, password) => {
      for (let i = 0; i < Number(limit); i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/auth/${route}`)
          .send({ email: `user${i}@example.com`, password })
          .expect(200);
      }
      await post(String(route), 'another@example.com').expect(429);
    },
  );

  it('giới hạn forgot-password theo email chuẩn hóa, kể cả khi đổi IP', async () => {
    for (let i = 0; i < 3; i++) {
      await post('forgot-password', 'User@Example.com')
        .set('X-Forwarded-For', `198.51.100.${i + 1}`)
        .expect(200);
    }
    await post('forgot-password', 'user@example.com').expect(429);
    expect(redis.consumeRateLimits).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ key: expect.stringContaining(':email:') }),
      ]),
    );
  });

  it('không tin X-Forwarded-For khi chưa cấu hình proxy; route khác không bị giới hạn', async () => {
    for (let i = 0; i < 5; i++) {
      await post('register', `user${i}@example.com`)
        .set('X-Forwarded-For', `198.51.100.${i + 1}`)
        .expect(201);
    }
    await post('register', 'another@example.com')
      .set('X-Forwarded-For', '203.0.113.9')
      .expect(429);
    for (let i = 0; i < 6; i++) {
      await request(app.getHttpServer()).get('/api/v1/probe').expect(200);
    }
  });

  it('dùng IP client do proxy tin cậy cung cấp', async () => {
    const express = app.getHttpAdapter().getInstance() as {
      set: (name: string, value: string | boolean) => void;
    };
    express.set('trust proxy', 'loopback');
    try {
      for (let i = 0; i < 5; i++) {
        await post('register', `first${i}@example.com`)
          .set('X-Forwarded-For', '198.51.100.1')
          .expect(201);
      }
      await post('register', 'blocked@example.com')
        .set('X-Forwarded-For', '198.51.100.1')
        .expect(429);
      await post('register', 'other@example.com')
        .set('X-Forwarded-For', '198.51.100.2')
        .expect(201);
    } finally {
      express.set('trust proxy', false);
    }
  });
});
