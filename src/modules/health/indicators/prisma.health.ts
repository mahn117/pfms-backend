import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../../../prisma/prisma.service';
import { checkWithTimeout } from './health-timeout';

@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await checkWithTimeout(this.prisma.$queryRaw`SELECT 1`, 3000);
      return indicator.up();
    } catch {
      return indicator.down();
    }
  }
}
