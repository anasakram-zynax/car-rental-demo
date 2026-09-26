import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../shared/database/prisma.module';
import { PaymentsModule } from '../payment/payments.module';
import { FlightsModule } from '../flights/flights.module';
import { HotelsModule } from '../hotels/hotels.module';
import { AdminPromoCodesController } from './api/admin-promo-codes.controller';
import { PublicPromoCodesController } from './api/public-promo-codes.controller';
import { PromoCodeAdminService } from './application/services/promo-code-admin.service';
import { PromoCodeEligibilityService } from './application/services/promo-code-eligibility.service';
import { PromoCodePricingService } from './application/services/promo-code-pricing.service';
import { PromoCodeRedemptionService } from './application/services/promo-code-redemption.service';
import { PromoCodeRepositoryToken } from './application/ports/promo-code.repository.port';
import { PromoRedemptionRepositoryToken } from './application/ports/promo-redemption.repository.port';
import { PrismaPromoCodeRepository } from './infrastructure/repositories/prisma-promo-code.repository';
import { PrismaPromoRedemptionRepository } from './infrastructure/repositories/prisma-promo-redemption.repository';
import { PromoCodeExpirationService } from './application/services/promo-code-expiration.service';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule,
    PaymentsModule,
    CurrencyModule,
    forwardRef(() => FlightsModule),
    forwardRef(() => HotelsModule),
  ],
  controllers: [AdminPromoCodesController, PublicPromoCodesController],
  providers: [
    { provide: PromoCodeRepositoryToken, useClass: PrismaPromoCodeRepository },
    { provide: PromoRedemptionRepositoryToken, useClass: PrismaPromoRedemptionRepository },
    PromoCodeAdminService,
    PromoCodeEligibilityService,
    PromoCodePricingService,
    PromoCodeRedemptionService,
    PromoCodeExpirationService,
  ],
  exports: [
    PromoCodeRedemptionService,
    PromoCodeEligibilityService,
    PromoCodePricingService,
    PromoCodeRepositoryToken,
    PromoRedemptionRepositoryToken,
  ],
})
export class PromoCodesModule {}
