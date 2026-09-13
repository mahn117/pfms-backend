import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AuthRateLimitGuard } from '../src/modules/auth/auth-rate-limit.guard';

describe('Goal - contribute flow (e2e)', () => {
  let app: NestExpressApplication;
  let accessToken: string;
  let goalId: string;

  const testEmail = `e2e-goal-flow-${Date.now()}@pfms.local`;
  const testPassword = 'Password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AuthRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();

    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());

    await app.init();

    const registerRes = await request(app.getHttpServer() as any)
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        fullName: 'E2E Goal Flow Tester',
      })
      .expect(201);

    accessToken = registerRes.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('tạo goal với targetAmount = 1.000.000', async () => {
    const res = await request(app.getHttpServer() as any)
      .post('/api/v1/goals')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Mua xe máy E2E', targetAmount: 1000000 })
      .expect(201);

    goalId = res.body.data.id;
    expect(Number(res.body.data.targetAmount)).toBe(1000000);
  });

  it('goal mới tạo phải có currentAmount = 0, status = IN_PROGRESS', async () => {
    const res = await request(app.getHttpServer() as any)
      .get(`/api/v1/goals/${goalId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Number(res.body.data.currentAmount)).toBe(0);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('contribute 300.000 lần đầu → currentAmount = 300.000, vẫn IN_PROGRESS', async () => {
    const res = await request(app.getHttpServer() as any)
      .post(`/api/v1/goals/${goalId}/contribute`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 300000 })
      .expect(201);

    expect(Number(res.body.data.currentAmount)).toBe(300000);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('contribute thêm 400.000 → currentAmount cộng dồn thành 700.000', async () => {
    const res = await request(app.getHttpServer() as any)
      .post(`/api/v1/goals/${goalId}/contribute`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 400000 })
      .expect(201);

    expect(Number(res.body.data.currentAmount)).toBe(700000);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('contribute thêm 500.000 (vượt targetAmount) → currentAmount = 1.200.000, status = COMPLETED', async () => {
    const res = await request(app.getHttpServer() as any)
      .post(`/api/v1/goals/${goalId}/contribute`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 500000 })
      .expect(201);

    expect(Number(res.body.data.currentAmount)).toBe(1200000);
    expect(res.body.data.status).toBe('COMPLETED');
  });

  it('contribute vào goal đã COMPLETED phải bị từ chối với lỗi 400 GOAL_ALREADY_FINISHED', async () => {
    const res = await request(app.getHttpServer() as any)
      .post(`/api/v1/goals/${goalId}/contribute`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 100000 })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.errorCode).toBe('GOAL_ALREADY_FINISHED');

    const getRes = await request(app.getHttpServer() as any)
      .get(`/api/v1/goals/${goalId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Number(getRes.body.data.currentAmount)).toBe(1200000);
  });
});
