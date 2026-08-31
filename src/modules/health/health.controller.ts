import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const checks: Record<string, 'up' | 'down'> = {
      api: 'up',
      db: 'down',
      redis: 'down',
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = 'up';
    } catch {
      checks.db = 'down';
    }

    try {
      const pong = await this.redis.ping();
      if (pong === 'PONG') checks.redis = 'up';
    } catch {
      checks.redis = 'down';
    }

    const healthy = Object.values(checks).every((s) => s === 'up');
    if (!healthy) {
      res.status(503);
    }
    return { status: healthy ? 'ok' : 'degraded', checks };
  }
}
