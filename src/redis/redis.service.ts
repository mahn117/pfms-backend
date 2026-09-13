import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async consumeRateLimits(
    limits: { key: string; limit: number; windowMs: number }[],
  ): Promise<number> {
    const script = `
      local retry = 0
      for i = 1, #KEYS do
        local count = tonumber(redis.call('GET', KEYS[i]) or '0')
        if count >= tonumber(ARGV[2 * i - 1]) then
          retry = math.max(retry, redis.call('PTTL', KEYS[i]), 1)
        end
      end
      if retry > 0 then return retry end
      for i = 1, #KEYS do
        local count = redis.call('INCR', KEYS[i])
        if count == 1 then redis.call('PEXPIRE', KEYS[i], ARGV[2 * i]) end
      end
      return 0
    `;
    const args = limits.flatMap(({ limit, windowMs }) => [limit, windowMs]);
    return Number(
      await this.client.eval(
        script,
        limits.length,
        ...limits.map(({ key }) => key),
        ...args,
      ),
    );
  }
}
