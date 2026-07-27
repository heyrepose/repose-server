import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    const checks: Record<string, 'up' | 'down'> = { api: 'up', db: 'down' };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = 'up';
    } catch {
      checks.db = 'down';
    }
    const healthy = Object.values(checks).every((s) => s === 'up');
    return { status: healthy ? 'ok' : 'degraded', checks };
  }
}
