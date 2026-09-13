import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AuthRateLimitGuard } from '../src/modules/auth/auth-rate-limit.guard';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Error flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;

  const emailPrefix = `e2e-errors-${randomUUID()}`;
  const emails = [`${emailPrefix}-a@pfms.local`, `${emailPrefix}-b@pfms.local`];
  const password = 'Password123';

  function expectError(
    body: unknown,
    statusCode: number,
    errorCode: string,
    path: string,
  ) {
    expect(body).toMatchObject({
      success: false,
      statusCode,
      errorCode,
      message: expect.any(String),
      timestamp: expect.any(String),
      path,
    });
    const timestamp = (body as { timestamp: string }).timestamp;
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  }

  async function register(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, fullName: 'E2E Error Tester' })
      .expect(201);
    return response.body.data.accessToken as string;
  }

  async function createWallet(token: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ví của B', type: 'CASH', initialBalance: 500000 })
      .expect(201);
    return response.body.data.id as string;
  }

  async function createCategory(token: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Danh mục của B', type: 'EXPENSE' })
      .expect(201);
    return response.body.data.id as string;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AuthRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
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

    prisma = app.get(PrismaService);
    tokenA = await register(emails[0]);
    tokenB = await register(emails[1]);
  });

  afterAll(async () => {
    if (!app) return;
    try {
      if (prisma) {
        const users = await prisma.user.findMany({
          where: { email: { in: emails } },
          select: { id: true },
        });
        const userIds = users.map(({ id }) => id);
        if (userIds.length > 0) {
          // Transactions restrict wallet deletion; remove them before users cascade.
          await prisma.transaction.deleteMany({
            where: { userId: { in: userIds } },
          });
          await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        }
      }
    } finally {
      await app.close();
    }
  });

  describe('validation fail', () => {
    it.each([
      ['thiếu amount', undefined],
      ['amount bằng 0', 0],
    ])('%s trả 400 và chi tiết lỗi DTO', async (_name, amount) => {
      const walletId = await createWallet(tokenA);
      const categoryId = await createCategory(tokenA);
      const response = await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          type: 'EXPENSE',
          walletId,
          categoryId,
          ...(amount === undefined ? {} : { amount }),
          date: '2026-08-20',
        })
        .expect(400);

      expectError(
        response.body,
        400,
        'VALIDATION_ERROR',
        '/api/v1/transactions',
      );
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'amount',
            message: expect.any(String),
          }),
        ]),
      );
    });

    it('register từ chối email sai định dạng', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'invalid-email', password, fullName: 'Invalid Email' })
        .expect(400);

      expectError(
        response.body,
        400,
        'VALIDATION_ERROR',
        '/api/v1/auth/register',
      );
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'Email',
            message: 'Email không hợp lệ',
          }),
        ]),
      );
    });

    it('whitelist từ chối trường ngoài DTO', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/wallets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Ví hợp lệ', type: 'CASH', unexpectedField: true })
        .expect(400);

      expectError(response.body, 400, 'VALIDATION_ERROR', '/api/v1/wallets');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('unexpectedField'),
          }),
        ]),
      );
    });
  });

  describe('unauthorized', () => {
    it('GET /users/me không có access token trả 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .expect(401);
      expectError(response.body, 401, 'UNAUTHORIZED', '/api/v1/users/me');
    });

    it('GET /wallets với Bearer token sai trả 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/wallets')
        .set('Authorization', 'Bearer invalid-access-token')
        .expect(401);
      expectError(response.body, 401, 'UNAUTHORIZED', '/api/v1/wallets');
    });
  });

  describe('not found', () => {
    const cases: [string, (id: string) => string, string][] = [
      ['wallet', (id: string) => `/api/v1/wallets/${id}`, 'WALLET_NOT_FOUND'],
      [
        'transaction',
        (id: string) => `/api/v1/transactions/${id}`,
        'TRANSACTION_NOT_FOUND',
      ],
      [
        'budget',
        (id: string) => `/api/v1/budgets/${id}/progress`,
        'BUDGET_NOT_FOUND',
      ],
      ['goal', (id: string) => `/api/v1/goals/${id}`, 'GOAL_NOT_FOUND'],
    ];
    it.each(cases)(
      '%s UUID không tồn tại trả 404',
      async (_name, pathForId, errorCode) => {
        const path = pathForId(randomUUID());
        const response = await request(app.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(404);
        expectError(response.body, 404, errorCode, path);
      },
    );
  });

  describe('cross-user ownership', () => {
    it('A sửa category của B nhận 403; category của B giữ nguyên', async () => {
      const categoryId = await createCategory(tokenB);
      const path = `/api/v1/categories/${categoryId}`;
      const denied = await request(app.getHttpServer())
        .patch(path)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Tên bị sửa bởi A' })
        .expect(403);
      expectError(denied.body, 403, 'FORBIDDEN', path);

      const owned = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(owned.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: categoryId, name: 'Danh mục của B' }),
        ]),
      );
    });

    it('A sửa wallet của B nhận 404; wallet của B giữ nguyên', async () => {
      const walletId = await createWallet(tokenB);
      const path = `/api/v1/wallets/${walletId}`;
      const denied = await request(app.getHttpServer())
        .patch(path)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Tên bị sửa bởi A' })
        .expect(404);
      expectError(denied.body, 404, 'WALLET_NOT_FOUND', path);

      const owned = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(owned.body.data).toMatchObject({ id: walletId, name: 'Ví của B' });
    });

    it('A sửa transaction của B nhận 404; giao dịch và số dư B giữ nguyên', async () => {
      const walletId = await createWallet(tokenB);
      const categoryId = await createCategory(tokenB);
      const created = await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          type: 'EXPENSE',
          walletId,
          categoryId,
          amount: 100000,
          date: '2026-08-20',
          note: 'Giao dịch của B',
        })
        .expect(201);
      const transactionId = created.body.data.id as string;
      const path = `/api/v1/transactions/${transactionId}`;
      const denied = await request(app.getHttpServer())
        .patch(path)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ note: 'Ghi chú bị sửa bởi A' })
        .expect(404);
      expectError(denied.body, 404, 'TRANSACTION_NOT_FOUND', path);

      const owned = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(owned.body.data).toMatchObject({
        id: transactionId,
        note: 'Giao dịch của B',
      });
      const wallet = await request(app.getHttpServer())
        .get(`/api/v1/wallets/${walletId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(Number(wallet.body.data.currentBalance)).toBe(400000);
    });

    it('A sửa budget của B nhận 404; hạn mức B giữ nguyên', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/budgets')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          periodType: 'CUSTOM',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
          limitAmount: 1000000,
        })
        .expect(201);
      const budgetId = created.body.data.id as string;
      const path = `/api/v1/budgets/${budgetId}`;
      const denied = await request(app.getHttpServer())
        .patch(path)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ limitAmount: 2000000 })
        .expect(404);
      expectError(denied.body, 404, 'BUDGET_NOT_FOUND', path);

      const owned = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(Number(owned.body.data.limitAmount)).toBe(1000000);
    });

    it('A contribute vào goal của B nhận 404; số tiền B giữ nguyên', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/goals')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Mục tiêu của B', targetAmount: 1000000 })
        .expect(201);
      const goalId = created.body.data.id as string;
      const path = `/api/v1/goals/${goalId}/contribute`;
      const denied = await request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: 100000 })
        .expect(404);
      expectError(denied.body, 404, 'GOAL_NOT_FOUND', path);

      const owned = await request(app.getHttpServer())
        .get(`/api/v1/goals/${goalId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(Number(owned.body.data.currentAmount)).toBe(0);
    });
  });
});
