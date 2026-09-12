import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  HealthCheckResult,
} from '@nestjs/terminus';
import { ErrorCode } from '../../common/constants/error-codes';
import { PrismaHealthIndicator } from './indicators/prisma.health';
import { RedisHealthIndicator } from './indicators/redis.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  async check() {
    try {
      return await this.health.check([
        () => this.prismaIndicator.isHealthy('database'),
        () => this.redisIndicator.isHealthy('redis'),
      ]);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) {
        throw error;
      }

      const result = error.getResponse() as HealthCheckResult;
      const failedIndicators = Object.keys(result.error ?? {});

      throw new ServiceUnavailableException({
        errorCode: ErrorCode.HEALTH_CHECK_FAILED,
        message: failedIndicators.length
          ? `Health check failed: ${failedIndicators.join(', ')}`
          : 'Health check unavailable',
      });
    }
  }
}
