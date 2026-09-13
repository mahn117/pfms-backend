import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AuthRateLimitGuard } from '../src/modules/auth/auth-rate-limit.guard';

describe('Wallet - Category - Transaction flow (e2e)', () => {
  let app: NestExpressApplication;
  let accessToken: string;
  let walletFromId: string;
  let walletToId: string;
  let categoryExpenseId: string;

  const testEmail = `e2e-wallet-flow-${Date.now()}@pfms.local`;
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
        fullName: 'E2E Wallet Flow Tester',
      })
      .expect(201);

    accessToken = registerRes.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('tạo Ví A với initialBalance = 2.000.000', async () => {
    const res = await request(app.getHttpServer() as any)
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Ví A', type: 'CASH', initialBalance: 2000000 })
      .expect(201);

    walletFromId = res.body.data.id;
    expect(Number(res.body.data.currentBalance)).toBe(2000000);
  });

  it('tạo Ví B với initialBalance mặc định = 0', async () => {
    const res = await request(app.getHttpServer() as any)
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Ví B', type: 'BANK' })
      .expect(201);

    walletToId = res.body.data.id;
    expect(Number(res.body.data.currentBalance)).toBe(0);
  });

  it('tạo danh mục chi tiêu (EXPENSE) của user', async () => {
    const res = await request(app.getHttpServer() as any)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Ăn uống E2E', type: 'EXPENSE' })
      .expect(201);

    categoryExpenseId = res.body.data.id;
    expect(res.body.data.type).toBe('EXPENSE');
  });

  it('tạo giao dịch EXPENSE 300.000 trên Ví A và kiểm tra số dư giảm đúng', async () => {
    await request(app.getHttpServer() as any)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'EXPENSE',
        walletId: walletFromId,
        categoryId: categoryExpenseId,
        amount: 300000,
        date: '2026-08-20',
        note: 'Chi tiêu test e2e',
      })
      .expect(201);

    const summaryRes = await request(app.getHttpServer() as any)
      .get(`/api/v1/wallets/${walletFromId}/summary`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Number(summaryRes.body.data.currentBalance)).toBe(1700000);
    expect(Number(summaryRes.body.data.totalExpense)).toBe(300000);
  });

  it('transfer 500.000 từ Ví A sang Ví B và kiểm tra số dư cả 2 ví', async () => {
    await request(app.getHttpServer() as any)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        walletId: walletFromId,
        toWalletId: walletToId,
        amount: 500000,
        date: '2026-08-21',
        note: 'Chuyển tiền test e2e',
      })
      .expect(201);

    const walletARes = await request(app.getHttpServer() as any)
      .get(`/api/v1/wallets/${walletFromId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const walletBRes = await request(app.getHttpServer() as any)
      .get(`/api/v1/wallets/${walletToId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Number(walletARes.body.data.currentBalance)).toBe(1200000);
    expect(Number(walletBRes.body.data.currentBalance)).toBe(500000);
  });
});
