import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service';
import { ErrorCode } from '../../common/constants/error-codes';

type AuthRateLimitRoute = 'login' | 'forgot-password' | 'register';
const RATE_LIMIT_ROUTE = 'authRateLimitRoute';

const POLICIES: Record<
  AuthRateLimitRoute,
  {
    ip: { limit: number; windowMs: number };
    email?: { limit: number; windowMs: number; pairWithIp?: boolean };
  }
> = {
  login: {
    ip: { limit: 20, windowMs: 5 * 60_000 },
    email: { limit: 5, windowMs: 5 * 60_000, pairWithIp: true },
  },
  'forgot-password': {
    ip: { limit: 10, windowMs: 15 * 60_000 },
    email: { limit: 3, windowMs: 15 * 60_000 },
  },
  register: { ip: { limit: 5, windowMs: 60 * 60_000 } },
};

export const AuthRateLimit = (route: AuthRateLimitRoute) =>
  SetMetadata(RATE_LIMIT_ROUTE, route);

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const route = this.reflector.get<AuthRateLimitRoute>(
      RATE_LIMIT_ROUTE,
      context.getHandler(),
    );
    if (!route) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const policy = POLICIES[route];
    const ipHash = this.hash(
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
    const limits = [
      { key: `rate-limit:auth:${route}:ip:${ipHash}`, ...policy.ip },
    ];

    const body: unknown = request.body;
    const email =
      typeof body === 'object' && body !== null && 'email' in body
        ? body.email
        : undefined;
    if (policy.email && typeof email === 'string') {
      const emailHash = this.hash(email.trim().toLowerCase());
      const suffix = policy.email.pairWithIp
        ? `email-ip:${emailHash}:${ipHash}`
        : `email:${emailHash}`;
      limits.push({
        key: `rate-limit:auth:${route}:${suffix}`,
        limit: policy.email.limit,
        windowMs: policy.email.windowMs,
      });
    }

    const retryAfterMs = await this.redis.consumeRateLimits(limits);
    if (retryAfterMs > 0) {
      response.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
      throw new HttpException(
        {
          errorCode: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
