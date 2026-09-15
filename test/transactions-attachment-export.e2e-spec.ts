import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AuthRateLimitGuard } from '../src/modules/auth/auth-rate-limit.guard';

describe('Transactions - Attachment & Export (e2e)', () => {
  let app: NestExpressApplication;
  let accessToken: string;
  let walletId: string;
  let categoryId: string;
  let transactionId: string;
  let foreignAccessToken: string;
  let foreignTransactionId: string;
  let deletedTransactionId: string;

  const testEmail = `e2e-attachment-${Date.now()}@pfms.local`;
  const foreignTestEmail = `e2e-attachment-foreign-${Date.now()}@pfms.local`;
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
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads/',
    });

    await app.init();

    const registerRes = await request(app.getHttpServer() as any)
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        fullName: 'E2E Attachment Tester',
      })
      .expect(201);

    accessToken = registerRes.body.data.accessToken;

    const walletRes = await request(app.getHttpServer() as any)
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Ví test e2e', type: 'CASH', initialBalance: 0 })
      .expect(201);

    walletId = walletRes.body.data.id;

    const categoryRes = await request(app.getHttpServer() as any)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Danh mục test e2e', type: 'EXPENSE' })
      .expect(201);

    categoryId = categoryRes.body.data.id;

    const transactionRes = await request(app.getHttpServer() as any)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'EXPENSE',
        walletId,
        categoryId,
        amount: 50000,
        date: '2026-08-20',
        note: 'Giao dịch test e2e attachment/export',
      })
      .expect(201);

    transactionId = transactionRes.body.data.id;

    const foreignRegisterRes = await request(app.getHttpServer() as any)
      .post('/api/v1/auth/register')
      .send({
        email: foreignTestEmail,
        password: testPassword,
        fullName: 'E2E Foreign Attachment Tester',
      })
      .expect(201);

    foreignAccessToken = foreignRegisterRes.body.data.accessToken;

    const foreignWalletRes = await request(app.getHttpServer() as any)
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${foreignAccessToken}`)
      .send({ name: 'Ví foreign', type: 'CASH', initialBalance: 0 })
      .expect(201);

    const foreignCategoryRes = await request(app.getHttpServer() as any)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${foreignAccessToken}`)
      .send({ name: 'Danh mục foreign', type: 'EXPENSE' })
      .expect(201);

    const foreignTransactionRes = await request(app.getHttpServer() as any)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${foreignAccessToken}`)
      .send({
        type: 'EXPENSE',
        walletId: foreignWalletRes.body.data.id,
        categoryId: foreignCategoryRes.body.data.id,
        amount: 10000,
        date: '2026-08-21',
      })
      .expect(201);

    foreignTransactionId = foreignTransactionRes.body.data.id;

    const deletedTransactionRes = await request(app.getHttpServer() as any)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'EXPENSE',
        walletId,
        categoryId,
        amount: 10000,
        date: '2026-08-22',
      })
      .expect(201);

    deletedTransactionId = deletedTransactionRes.body.data.id;
    await request(app.getHttpServer() as any)
      .delete(`/api/v1/transactions/${deletedTransactionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /transactions/:id/attachment', () => {
    it('nên upload thành công với file ảnh hợp lệ và trả về attachmentUrl', async () => {
      const res = await request(app.getHttpServer() as any)
        .post(`/api/v1/transactions/${transactionId}/attachment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', join(__dirname, 'fixtures', 'valid-image.jpg'))
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.attachmentUrl).toMatch(/^\/uploads\/.+\.jpg$/);
    });

    it('nên từ chối file sai định dạng (.txt) với errorCode INVALID_FILE_TYPE', async () => {
      const res = await request(app.getHttpServer() as any)
        .post(`/api/v1/transactions/${transactionId}/attachment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', join(__dirname, 'fixtures', 'invalid-file.txt'))
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('INVALID_FILE_TYPE');
    });

    it('nên trả 404 khi upload vào transaction của user khác', async () => {
      const res = await request(app.getHttpServer() as any)
        .post(`/api/v1/transactions/${foreignTransactionId}/attachment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', join(__dirname, 'fixtures', 'valid-image.jpg'))
        .expect(404);

      expect(res.body.errorCode).toBe('TRANSACTION_NOT_FOUND');

      const unchanged = await request(app.getHttpServer() as any)
        .get(`/api/v1/transactions/${foreignTransactionId}`)
        .set('Authorization', `Bearer ${foreignAccessToken}`)
        .expect(200);
      expect(unchanged.body.data.attachmentUrl).toBeNull();
    });

    it('nên trả 404 khi transaction không tồn tại', async () => {
      const res = await request(app.getHttpServer() as any)
        .post(`/api/v1/transactions/${randomUUID()}/attachment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', join(__dirname, 'fixtures', 'valid-image.jpg'))
        .expect(404);

      expect(res.body.errorCode).toBe('TRANSACTION_NOT_FOUND');
    });

    it('nên trả 404 khi transaction đã bị soft-delete', async () => {
      const res = await request(app.getHttpServer() as any)
        .post(`/api/v1/transactions/${deletedTransactionId}/attachment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', join(__dirname, 'fixtures', 'valid-image.jpg'))
        .expect(404);

      expect(res.body.errorCode).toBe('TRANSACTION_NOT_FOUND');
    });

    it('nên kiểm tra ownership trước fileFilter cho transaction của user khác', async () => {
      const res = await request(app.getHttpServer() as any)
        .post(`/api/v1/transactions/${foreignTransactionId}/attachment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', join(__dirname, 'fixtures', 'invalid-file.txt'))
        .expect(404);

      expect(res.body.errorCode).toBe('TRANSACTION_NOT_FOUND');
    });

    it('nên trả về 401 nếu không có accessToken', async () => {
      await request(app.getHttpServer() as any)
        .post(`/api/v1/transactions/${transactionId}/attachment`)
        .expect(401);
    });
  });

  describe('GET /transactions/export', () => {
    it('nên trả về CSV đúng content-type và chứa transaction vừa tạo', async () => {
      const res = await request(app.getHttpServer() as any)
        .get('/api/v1/transactions/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ from: '2026-08-01', to: '2026-08-31' })
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');

      const csvText = res.text;
      const lines = csvText.trim().split('\n');

      expect(lines[0]).toContain('id,type,wallet,category,amount,date,note');
      expect(lines.length - 1).toBeGreaterThanOrEqual(1);

      const hasOurTransaction = lines.some((line) =>
        line.includes(transactionId),
      );
      expect(hasOurTransaction).toBe(true);
    });

    it('nên trả về CSV chỉ có header (không có dữ liệu) khi filter không khớp transaction nào', async () => {
      const res = await request(app.getHttpServer() as any)
        .get('/api/v1/transactions/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ from: '2020-01-01', to: '2020-01-31' })
        .expect(200);

      const lines = res.text.trim().split('\n');
      expect(lines.length).toBe(1);
    });
  });
});
