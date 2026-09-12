import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
  Res,
  UnauthorizedException,
  UseGuards,
  type CanActivate,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { Logger } from 'nestjs-pino';
import { Writable } from 'stream';
import request from 'supertest';
import type { Response } from 'express';
import { AllExceptionsFilter } from '../filters/http-exception.filter';
import { ResponseInterceptor } from '../interceptors/response.interceptor';
import { httpLoggerOptions } from './http-logger.config';

class DenyGuard implements CanActivate {
  canActivate(): never {
    throw new UnauthorizedException();
  }
}

@Controller('logging-test')
class LoggingTestController {
  @Get('ok')
  ok() {
    return { value: 'ok' };
  }

  @Get('bad')
  bad(): never {
    throw new BadRequestException('invalid');
  }

  @Get('crash')
  crash(): never {
    throw new Error('private-error-detail');
  }

  @Get('guard')
  @UseGuards(DenyGuard)
  guard() {
    return 'unreachable';
  }

  @Get('direct')
  direct(@Res() response: Response) {
    response.type('text/csv').send('id\n1\n');
  }
}

describe('HTTP logging and correlation ID', () => {
  let app: INestApplication;
  const lines: string[] = [];

  beforeAll(async () => {
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const module = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({ pinoHttp: [httpLoggerOptions, stream] }),
      ],
      controllers: [LoggingTestController],
    }).compile();

    app = module.createNestApplication();
    app.useLogger(module.get(Logger));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    lines.length = 0;
  });

  it('creates an ID and logs a successful request without secrets', async () => {
    const response = await request(app.getHttpServer())
      .get('/logging-test/ok?token=query-secret')
      .set('Authorization', 'Bearer header-secret')
      .expect(200);

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(response.body).toMatchObject({
      success: true,
      data: { value: 'ok' },
    });
    const logs = lines.join('');
    expect(logs).toContain(response.headers['x-request-id']);
    expect(logs).toContain('/logging-test/ok');
    expect(logs).not.toContain('query-secret');
    expect(logs).not.toContain('header-secret');
  });

  it('propagates a valid ID through an HTTP exception', async () => {
    const response = await request(app.getHttpServer())
      .get('/logging-test/bad')
      .set('X-Request-ID', 'client-123')
      .expect(400);

    expect(response.headers['x-request-id']).toBe('client-123');
    expect(response.body).toMatchObject({ success: false, statusCode: 400 });
    expect(lines.join('')).toContain('client-123');
  });

  it('replaces an invalid ID and preserves it for guard failures', async () => {
    const response = await request(app.getHttpServer())
      .get('/logging-test/guard')
      .set('X-Request-ID', 'bad id')
      .expect(401);

    expect(response.headers['x-request-id']).not.toBe('bad id');
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(lines.join('')).toContain(response.headers['x-request-id']);
  });

  it('does not log private exception details on 500', async () => {
    const response = await request(app.getHttpServer())
      .get('/logging-test/crash?token=query-secret')
      .expect(500);

    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.body.message).not.toContain('private-error-detail');
    expect(response.body.path).toBe('/logging-test/crash');
    expect(lines.join('')).not.toContain('private-error-detail');
    expect(lines.join('')).not.toContain('query-secret');
    expect(lines.join('')).toContain(response.headers['x-request-id']);
  });

  it('adds the ID to a direct file-style response', async () => {
    const response = await request(app.getHttpServer())
      .get('/logging-test/direct')
      .expect(200);

    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toBe('id\n1\n');
    expect(lines.join('')).toContain(response.headers['x-request-id']);
  });
});
