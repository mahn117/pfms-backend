import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { RedisService } from '../../../redis/redis.service';
import { checkWithTimeout } from './health-timeout';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly redisService: RedisService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await checkWithTimeout(this.redisService.ping(), 3000);
      return indicator.up();
    } catch {
      return indicator.down();
    }
  }
}
