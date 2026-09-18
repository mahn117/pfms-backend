import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AuthRateLimitGuard } from '../src/modules/auth/auth-rate-limit.guard';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Transaction balance consistency (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let token: string;
  const base = '/api/v1';

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
    prisma = app.get(PrismaService);

    const registered = await request(app.getHttpServer())
      .post(`${base}/auth/register`)
      .send({
        email: `balance-${randomUUID()}@pfms.local`,
        password: 'Password123',
        fullName: 'Balance E2E',
      })
      .expect(201);
    token = registered.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createWallet(initialBalance: number): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${base}/wallets`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Balance ${randomUUID()}`, type: 'CASH', initialBalance })
      .expect(201);
    return response.body.data.id as string;
  }

  async function balance(walletId: string): Promise<number> {
    const response = await request(app.getHttpServer())
      .get(`${base}/wallets/${walletId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return Number(response.body.data.currentBalance);
  }

  async function reconcile(
    walletId: string,
    actualBalance: number,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${base}/wallets/${walletId}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actualBalance, confirm: true })
      .expect(201);
    return response.body.data.transactionId as string;
  }

  it('TRANSFER create, PATCH amount và DELETE giữ đúng số dư hai ví', async () => {
    const source = await createWallet(500);
    const destination = await createWallet(200);

    const created = await request(app.getHttpServer())
      .post(`${base}/transactions/transfer`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        walletId: source,
        toWalletId: destination,
        amount: 100,
        date: '2026-08-20',
      })
      .expect(201);
    expect([await balance(source), await balance(destination)]).toEqual([
      400, 300,
    ]);

    await request(app.getHttpServer())
      .patch(`${base}/transactions/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 150 })
      .expect(200);
    const updatedTransfer = await request(app.getHttpServer())
      .get(`${base}/transactions/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Number(updatedTransfer.body.data.amount)).toBe(150);
    expect([await balance(source), await balance(destination)]).toEqual([
      350, 350,
    ]);

    await request(app.getHttpServer())
      .delete(`${base}/transactions/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect([await balance(source), await balance(destination)]).toEqual([
      500, 200,
    ]);
  });

  it('ADJUSTMENT dương: PATCH note bị từ chối, GET và balance không đổi, DELETE hoàn nguyên', async () => {
    const walletId = await createWallet(200);
    const transactionId = await reconcile(walletId, 300);
    expect(await balance(walletId)).toBe(300);

    const before = await request(app.getHttpServer())
      .get(`${base}/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rejected = await request(app.getHttpServer())
      .patch(`${base}/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'test' })
      .expect(400);
    expect(rejected.body.errorCode).toBe('ADJUSTMENT_NOT_EDITABLE');

    const after = await request(app.getHttpServer())
      .get(`${base}/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.data).toEqual(before.body.data);
    expect(await balance(walletId)).toBe(300);

    await request(app.getHttpServer())
      .delete(`${base}/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(await balance(walletId)).toBe(200);
  });

  it('ADJUSTMENT âm: PATCH note bị business rule từ chối, DELETE hoàn nguyên số dư', async () => {
    const walletId = await createWallet(200);
    const transactionId = await reconcile(walletId, 100);
    expect(await balance(walletId)).toBe(100);

    const rejected = await request(app.getHttpServer())
      .patch(`${base}/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'test' })
      .expect(400);
    expect(rejected.body.errorCode).toBe('ADJUSTMENT_NOT_EDITABLE');
    expect(await balance(walletId)).toBe(100);

    await request(app.getHttpServer())
      .delete(`${base}/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(await balance(walletId)).toBe(200);
  });

  it('Prisma rollback không commit cập nhật ví khi mutation sau thất bại', async () => {
    const walletId = await createWallet(500);

    await expect(
      prisma.$transaction([
        prisma.wallet.update({
          where: { id: walletId },
          data: { currentBalance: { increment: 50 } },
        }),
        prisma.wallet.update({
          where: { id: randomUUID() },
          data: { currentBalance: { increment: 50 } },
        }),
      ]),
    ).rejects.toThrow();

    expect(await balance(walletId)).toBe(500);
  });
});
