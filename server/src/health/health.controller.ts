import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@nlmlio/shared';
import Redis from 'ioredis';
import { PrismaService } from '../infra/database/prisma.service';
import { REDIS } from '../infra/redis/redis.module';

// 개발 환경 확인용: DB·Redis 연결 상태
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => true,
        () => false,
      ),
      this.redis.ping().then(
        (r) => r === 'PONG',
        () => false,
      ),
    ]);
    return { status: database && redis ? 'ok' : 'degraded', database, redis };
  }
}
