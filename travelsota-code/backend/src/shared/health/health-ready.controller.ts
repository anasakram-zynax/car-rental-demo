import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from '../response/response-message.decorator';
import { PrismaService } from '../database/prisma.service';

@Controller('health')
export class HealthReadyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('ready')
  @ResponseMessage('Database reachable.')
  async getReady() {
    try {
      await Promise.race([
        this.prisma.$queryRawUnsafe('SELECT 1'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('DB probe timed out')), 3_000),
        ),
      ]);
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      return { status: 'degraded', database: 'unreachable', error: (error as Error).message };
    }
  }
}
