import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from '../response/response-message.decorator';
import { RequirePermission } from '../../modules/access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../modules/access-control/domain/enums/permission-code.enum';

@Controller('health')
export class HealthController {
  @Get()
  @ResponseMessage('Backend healthy.')
  getHealth() {
    return {
      status: 'ok',
      service: 'travelsota-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  @Get('diagnostics')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Diagnostics retrieved.')
  getDiagnostics() {
    return {
      appRole: process.env.APP_ROLE ?? 'api',
      prismaPoolMax: process.env.PRISMA_POOL_MAX ?? '3',
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      workers: {
        outboxRelay: process.env.ENABLE_OUTBOX_RELAY === 'true',
        emailWorker: process.env.ENABLE_EMAIL_WORKER === 'true',
        hotelScheduler: process.env.ENABLE_HOTEL_CONTENT_SCHEDULER === 'true',
        promoExpiration: process.env.ENABLE_PROMO_EXPIRATION_WORKER === 'true',
        flightRecovery: process.env.ENABLE_FLIGHT_RECOVERY_WORKER === 'true',
        paymentScheduler: process.env.ENABLE_PAYMENT_SCHEDULER === 'true',
      },
      memory: {
        rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    };
  }
}
