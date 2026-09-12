/// <reference types="jest" />

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './indicators/prisma.health';
import { RedisHealthIndicator } from './indicators/redis.health';

describe('HealthController', () => {
  let app: INestApplication;
  const prisma = { $queryRaw: jest.fn() };
  const redis = { ping: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        PrismaHealthIndicator,
        RedisHealthIndicator,
        { provide: PrismaService, useValue: prisma },
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
    prisma.$queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockReset().mockResolvedValue('PONG');
  });

  afterAll(async () => {
    await app.close();
  });

  it('trả 200 khi PostgreSQL và Redis đều hoạt động', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      statusCode: 200,
      data: {
        status: 'ok',
        details: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
      },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(redis.ping).toHaveBeenCalledTimes(1);
  });

  it('trả 503 khi PostgreSQL không hoạt động', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('database unavailable'));

    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503);

    expect(response.body).toMatchObject({
      success: false,
      statusCode: 503,
      errorCode: 'HEALTH_CHECK_FAILED',
      message: 'Health check failed: database',
    });
    expect(response.body.message).not.toContain('database unavailable');
    expect(redis.ping).toHaveBeenCalledTimes(1);
  });

  it('trả 503 khi Redis không hoạt động', async () => {
    redis.ping.mockRejectedValue(new Error('redis unavailable'));

    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503);

    expect(response.body).toMatchObject({
      success: false,
      statusCode: 503,
      errorCode: 'HEALTH_CHECK_FAILED',
      message: 'Health check failed: redis',
    });
    expect(response.body.message).not.toContain('redis unavailable');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('không chờ vô hạn khi Redis không phản hồi', async () => {
    redis.ping.mockImplementation(() => new Promise(() => undefined));

    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503);

    expect(response.body).toMatchObject({
      success: false,
      statusCode: 503,
      errorCode: 'HEALTH_CHECK_FAILED',
      message: 'Health check failed: redis',
    });
  }, 10000);

  it('không chờ vô hạn khi PostgreSQL không phản hồi', async () => {
    prisma.$queryRaw.mockImplementation(() => new Promise(() => undefined));

    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503);

    expect(response.body).toMatchObject({
      success: false,
      statusCode: 503,
      errorCode: 'HEALTH_CHECK_FAILED',
      message: 'Health check failed: database',
    });
  }, 10000);
});
