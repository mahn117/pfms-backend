import { randomUUID } from 'crypto';
import type { Options } from 'pino-http';
import type { Request, Response } from 'express';

const REQUEST_ID_HEADER = 'X-Request-ID';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export const httpLoggerOptions: Options = {
  genReqId: (request, response) => {
    const incoming = request.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
        ? incoming
        : randomUUID();

    response.setHeader(REQUEST_ID_HEADER, requestId);
    return requestId;
  },
  customLogLevel: (_request, response) => {
    if (response.statusCode >= 500) return 'error';
    if (response.statusCode >= 400) return 'warn';
    return 'info';
  },
  wrapSerializers: false,
  serializers: {
    req: (value: unknown) => {
      const request = value as Request & { id?: string };
      return {
        id: request.id,
        method: request.method,
        path: request.url?.split('?')[0],
      };
    },
    res: (value: unknown) => ({ statusCode: (value as Response).statusCode }),
    err: (value: unknown) => ({
      type: value instanceof Error ? value.name : 'Error',
    }),
  },
  redact: {
    paths: [
      'req.headers',
      'req.body',
      'res.headers',
      'res.body',
      'headers',
      'body',
      'authorization',
      'password',
      'refreshToken',
      'accessToken',
      'otp',
      '*.authorization',
      '*.password',
      '*.refreshToken',
      '*.accessToken',
      '*.otp',
    ],
    censor: '[REDACTED]',
  },
};
