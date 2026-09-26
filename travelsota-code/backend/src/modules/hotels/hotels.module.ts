import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { HotelsController } from './api/hotels.controller';
import { HotelBookingRepoPortToken } from './application/ports/hotel-booking-repo.port';
import { PrismaHotelBookingRepository } from './infrastructure/repositories/prisma-hotel-booking.repository';
import { HotelBookingService } from './application/services/hotel-booking.service';
import { HotelDetailsService } from './application/services/hotel-details.service';
import { HotelDetailsOrchestratorService } from './application/services/hotel-details-orchestrator.service';
import { HotelSearchAggregatorService } from './application/services/hotel-search-aggregator.service';
import { HotelSearchFilterService } from './application/services/hotel-search-filter.service';
import { HotelGroupingService } from './application/services/hotel-grouping.service';
import { HotelManualHoldExpiryCron } from './application/services/hotel-manual-hold-expiry.cron';
import { HotelPaymentListener } from './application/services/hotel-payment.listener';
import { HotelSupplierLinksRepoPortToken } from './application/ports/hotel-provider-mapping-repo.port';
import { PrismaHotelSupplierLinksRepository } from './infrastructure/repositories/prisma-hotel-provider-mapping.repository';
import { PaymentsModule } from '../payment/payments.module';
import { SettingsModule } from '../settings/settings.module';
import { MarkupModule } from '../markup/markup.module';
import { PromoCodesModule } from '../promo-codes/promo-codes.module';
import { HotelsProviderRegistryModule } from './providers/registry/hotels-provider-registry.module';
import { HotelsProviderRegistryService } from './providers/registry/hotels-provider-registry.service';
import { SearchJobModule } from '../search-job/search-job.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CurrencyModule } from '../currency/currency.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { WalletModule } from '../wallet/wallet.module';
import { ManualHotelsService } from './manual/application/services/manual-hotels.service';
import { ManualHotelsController } from './manual/api/manual-hotels.controller';
import { ManualHotelsPublicController } from './manual/api/manual-hotels-public.controller';
import { ManualHotelProvider } from './manual/manual-hotel.provider';
import { PolicyAggregatorService } from './policies/policy-aggregator.service';
import { HotelbedsPolicyNormalizer } from './policies/hotelbeds-policy-normalizer';
import { AmadeusPolicyNormalizer } from './policies/amadeus-policy-normalizer';
import { RateHawkPolicyNormalizer } from './policies/ratehawk-policy-normalizer';

@Module({
  imports: [
    PaymentsModule,
    SettingsModule,
    MarkupModule,
    forwardRef(() => PromoCodesModule),
    HotelsProviderRegistryModule,
    SearchJobModule,
    NotificationsModule,
    CurrencyModule,
    InvoicesModule,
    WalletModule,
  ],
  controllers: [
    HotelsController,
    ManualHotelsController,
    ManualHotelsPublicController,
  ],
  providers: [
    HotelBookingService,
    HotelDetailsService,
    HotelDetailsOrchestratorService,
    HotelSearchAggregatorService,
    HotelSearchFilterService,
    HotelGroupingService,
    HotelPaymentListener,
    HotelManualHoldExpiryCron,
    PolicyAggregatorService,
    HotelbedsPolicyNormalizer,
    AmadeusPolicyNormalizer,
    RateHawkPolicyNormalizer,
    {
      provide: HotelBookingRepoPortToken,
      useClass: PrismaHotelBookingRepository,
    },
    {
      provide: HotelSupplierLinksRepoPortToken,
      useClass: PrismaHotelSupplierLinksRepository,
    },
    ManualHotelsService,
    ManualHotelProvider,
  ],
  exports: [
    HotelBookingService,
    HotelDetailsService,
    HotelSearchAggregatorService,
    HotelGroupingService,
    HotelBookingRepoPortToken,
    ManualHotelsService,
    ManualHotelProvider,
  ],
})
export class HotelsModule implements OnModuleInit {
  constructor(
    private readonly registry: HotelsProviderRegistryService,
    private readonly manualHotelProvider: ManualHotelProvider,
  ) {}

  onModuleInit() {
    // Only the manual hotel provider is registered in this starter kit —
    // real supplier integrations (Hotelbeds, RateHawk, Amadeus, Travelport
    // Stays) and the hotel-content ingestion subsystem were intentionally
    // removed. Search/booking always resolves to the manual catalog; the
    // registry pattern is unchanged, so a real provider can be registered
    // here again later without touching any calling code.
    this.registry.register(this.manualHotelProvider);
  }
}
