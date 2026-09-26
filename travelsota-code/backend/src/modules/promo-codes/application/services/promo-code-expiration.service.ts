import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PromoRedemptionRepositoryToken } from '../ports/promo-redemption.repository.port';
import type { IPromoRedemptionRepository } from '../ports/promo-redemption.repository.port';
import { PostgresAdvisoryLockService } from '../../../../shared/locks/postgres-advisory-lock.service';

@Injectable()
export class PromoCodeExpirationService {
  private readonly logger = new Logger(PromoCodeExpirationService.name);
  private running = false;

  constructor(
    @Inject(PromoRedemptionRepositoryToken) private readonly redemptionRepo: IPromoRedemptionRepository,
    private readonly lockService: PostgresAdvisoryLockService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStaleReservations(): Promise<void> {
    if (process.env.ENABLE_PROMO_EXPIRATION_WORKER !== 'true') return;
    if (this.running) return;
    this.running = true;
    try {
      await this.lockService.withLock('promo-expiration', async () => {
        const expired = await this.redemptionRepo.expireStaleReservations();
        if (expired > 0) {
          this.logger.log(`Released ${expired} expired promo reservations.`);
        }
      });
    } finally {
      this.running = false;
    }
  }
}
