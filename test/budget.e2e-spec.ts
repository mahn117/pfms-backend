import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AuthRateLimitGuard } from '../src/modules/auth/auth-rate-limit.guard';

describe('Budget - progress flow (e2e)', () => {
  let app: NestExpressApplication;
  let accessToken: string;
  let walletId: string;
  let categoryExpenseId: string;
  let budgetId: string;

  const testEmail = `e2e-budget-flow-${Date.now()}@pfms.local`;
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
        fullName: 'E2E Budget Flow Tester',
      })
      .expect(201);

    accessToken = registerRes.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('tạo Ví để phát sinh giao dịch', async () => {
    const res = await request(app.getHttpServer() as any)
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Ví Budget E2E', type: 'CASH', initialBalance: 5000000 })
      .expect(201);

    walletId = res.body.data.id;
  });

  it('tạo danh mục chi tiêu (EXPENSE) để gắn budget', async () => {
    const res = await request(app.getHttpServer() as any)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Ăn uống E2E Budget', type: 'EXPENSE' })
      .expect(201);

    categoryExpenseId = res.body.data.id;
  });

  it('tạo budget CUSTOM từ 01/08/2026 đến 31/08/2026, limitAmount = 1.000.000', async () => {
    const res = await request(app.getHttpServer() as any)
      .post('/api/v1/budgets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        categoryId: categoryExpenseId,
        periodType: 'CUSTOM',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        limitAmount: 1000000,
      })
      .expect(201);

    budgetId = res.body.data.id;
    expect(Number(res.body.data.limitAmount)).toBe(1000000);
  });

  it('progress ban đầu phải là spent = 0, percentUsed = 0', async () => {
    const res = await request(app.getHttpServer() as any)
      .get(`/api/v1/budgets/${budgetId}/progress`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.spent).toBe(0);
    expect(res.body.data.remaining).toBe(1000000);
    expect(res.body.data.percentUsed).toBe(0);
    expect(res.body.data.isOverThreshold80).toBe(false);
    expect(res.body.data.isOverLimit).toBe(false);
  });

  it('tạo giao dịch EXPENSE 400.000 trong kỳ, đúng category → progress cập nhật 40%', async () => {
    await request(app.getHttpServer() as any)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'EXPENSE',
        walletId,
        categoryId: categoryExpenseId,
        amount: 400000,
        date: '2026-08-10',
        note: 'Chi tiêu trong kỳ 1',
      })
      .expect(201);

    const res = await request(app.getHttpServer() as any)
      .get(`/api/v1/budgets/${budgetId}/progress`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.spent).toBe(400000);
    expect(res.body.data.remaining).toBe(600000);
    expect(res.body.data.percentUsed).toBe(40);
    expect(res.body.data.isOverThreshold80).toBe(false);
  });

  it('tạo thêm giao dịch EXPENSE 500.000 (tổng 900.000) → vượt ngưỡng 80% nhưng chưa vượt limit', async () => {
    await request(app.getHttpServer() as any)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'EXPENSE',
        walletId,
        categoryId: categoryExpenseId,
        amount: 500000,
        date: '2026-08-15',
        note: 'Chi tiêu trong kỳ 2',
      })
      .expect(201);

    const res = await request(app.getHttpServer() as any)
      .get(`/api/v1/budgets/${budgetId}/progress`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.spent).toBe(900000);
    expect(res.body.data.remaining).toBe(100000);
    expect(res.body.data.percentUsed).toBe(90);
    expect(res.body.data.isOverThreshold80).toBe(true);
    expect(res.body.data.isOverLimit).toBe(false);
  });

  it('giao dịch cùng category nhưng NẰM NGOÀI kỳ ngân sách (05/09/2026) không được tính vào progress', async () => {
    await request(app.getHttpServer() as any)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'EXPENSE',
        walletId,
        categoryId: categoryExpenseId,
        amount: 300000,
        date: '2026-09-05',
        note: 'Chi tiêu ngoài kỳ ngân sách',
      })
      .expect(201);

    const res = await request(app.getHttpServer() as any)
      .get(`/api/v1/budgets/${budgetId}/progress`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.spent).toBe(900000);
    expect(res.body.data.percentUsed).toBe(90);
  });
});
