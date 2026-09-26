import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { PaymentsModule } from '../payment/payments.module';
import { MarkupModule } from '../markup/markup.module';
import { WalletModule } from '../wallet/wallet.module';
import { CurrencyModule } from '../currency/currency.module';
import { SearchJobModule } from '../search-job/search-job.module';
import { PromoCodesModule } from '../promo-codes/promo-codes.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FlightBookingsController } from './api/flight-bookings.controller';
import { FlightsController } from './api/flights.controller';
import { AdminFlightsController } from './api/admin-flights.controller';
import { ManualFlightsController } from './manual/api/manual-flights.controller';
import { ManualFlightsPublicController } from './manual/api/manual-flights-public.controller';
import { ManualFlightsService } from './manual/application/services/manual-flights.service';
import { ManualFlightProvider } from './manual/manual-flight.provider';
import { ManualFlightBookingProvider } from './manual/manual-flight-booking.provider';
import { FlightSearchAggregatorService } from './application/services/flight-search-aggregator.service';
import { SelectedOfferCacheService } from './application/services/selected-offer-cache.service';
import { AncillaryCatalogParserService } from './application/services/ancillary-catalog-parser.service';
import { TravelportAncillaryService } from './application/services/travelport-ancillary.service';
import { TravelportBookingCoreService } from './application/services/travelport-booking-core.service';
import { TravelportBookingOrchestratorService } from './application/services/travelport-booking-orchestrator.service';
import { TravelportBookingWorkflowService } from './application/services/travelport-booking-workflow.service';
import { TravelportErrorClassifierService } from './application/services/travelport-error-classifier.service';
import { TravelportMealSsrService } from './application/services/travelport-meal-ssr.service';
import { TravelportPayloadBuilderService } from './application/services/travelport-payload-builder.service';
import { TravelportPostBookingExtrasService } from './application/services/travelport-post-booking-extras.service';
import { TravelportSeatMapBuilderService } from './application/services/travelport-seat-map-builder.service';
import { TravelportWorkflowHttpService } from './application/services/travelport-workflow-http.service';
import { TravelportWorkflowRequestBuilderService } from './application/services/travelport-workflow-request-builder.service';
import { TravelportWorkflowResponseParserService } from './application/services/travelport-workflow-response-parser.service';
import { AdminTravelportDiagnosticsService } from './application/services/admin-travelport-diagnostics.service';
import { PrismaReferenceDataRepository } from './infrastructure/reference-data/prisma-reference-data.repository';
import { FlightBookingPublicService } from './application/services/flight-booking-public.service';
import { FlightCheckoutSessionService } from './application/services/flight-checkout-session.service';
import { FlightResponseMapper } from './application/services/flight-response.mapper';
import { FlightOfferDetailViewMapper } from './application/services/flight-offer-detail-view.mapper';
import { FlightSearchFilterService } from './application/services/flight-search-filter.service';
import { FlightDisplayEnrichmentService } from './application/services/flight-display-enrichment.service';
import { FlightsProviderRegistryService } from './application/services/flights-provider-registry.service';
import { FlightPaymentListener } from './application/services/flight-payment.listener';
import { FlightRefundListener } from './application/services/flight-refund.listener';
import { FlightReconciliationCron } from './application/services/flight-reconciliation.cron';
import { FlightDeadLetterRecoveryCron } from './application/services/flight-dead-letter-recovery.cron';
import { FlightHoldExpiryCron } from './application/services/flight-hold-expiry.cron';
import { FlightBookingProviderRegistryService } from './application/services/flight-booking-provider-registry.service';
import { PrismaFlightBookingRepository } from './infrastructure/repositories/prisma-flight-booking.repository';
import { PrismaFlightBookingExtraRepository } from './infrastructure/repositories/prisma-flight-booking-extra.repository';
import { FlightBookingRepoPortToken } from './application/ports/flight-booking-repo.port';
import { FlightBookingExtraRepoPortToken } from './application/ports/flight-booking-extra-repo.port';
import { FlightOfferSnapshotService } from './application/services/flight-offer-snapshot.service';
import { InvoicesModule } from '../invoices/invoices.module';
import { FlightOfferSnapshotRepoPortToken } from './application/ports/flight-offer-snapshot-repo.port';
import { PrismaFlightOfferSnapshotRepository } from './infrastructure/repositories/prisma-flight-offer-snapshot.repository';

@Module({
  imports: [
    SettingsModule,
    PaymentsModule,
    MarkupModule,
    WalletModule,
    CurrencyModule,
    SearchJobModule,
    forwardRef(() => PromoCodesModule),
    NotificationsModule,
    InvoicesModule,
  ],
  controllers: [
    FlightBookingsController,
    FlightsController,
    AdminFlightsController,
    ManualFlightsController,
    ManualFlightsPublicController,
  ],
  providers: [
    AncillaryCatalogParserService,
    TravelportAncillaryService,
    TravelportBookingCoreService,
    TravelportBookingOrchestratorService,
    TravelportBookingWorkflowService,
    TravelportErrorClassifierService,
    TravelportMealSsrService,
    TravelportPayloadBuilderService,
    TravelportPostBookingExtrasService,
    TravelportSeatMapBuilderService,
    TravelportWorkflowHttpService,
    TravelportWorkflowRequestBuilderService,
    TravelportWorkflowResponseParserService,
    AdminTravelportDiagnosticsService,
    PrismaReferenceDataRepository,
    SelectedOfferCacheService,
    FlightBookingPublicService,
    FlightCheckoutSessionService,
    FlightResponseMapper,
    FlightSearchFilterService,
    FlightDisplayEnrichmentService,
    FlightOfferDetailViewMapper,
    FlightSearchAggregatorService,
    FlightsProviderRegistryService,
    FlightPaymentListener,
    FlightRefundListener,
    FlightReconciliationCron,
    FlightDeadLetterRecoveryCron,
    FlightHoldExpiryCron,
    FlightBookingProviderRegistryService,
    {
      provide: FlightBookingRepoPortToken,
      useClass: PrismaFlightBookingRepository,
    },
    {
      provide: FlightBookingExtraRepoPortToken,
      useClass: PrismaFlightBookingExtraRepository,
    },
    FlightOfferSnapshotService,
    ManualFlightsService,
    ManualFlightProvider,
    ManualFlightBookingProvider,
    {
      provide: FlightOfferSnapshotRepoPortToken,
      useClass: PrismaFlightOfferSnapshotRepository,
    },
  ],
  exports: [
    FlightsProviderRegistryService,
    FlightBookingProviderRegistryService,
    FlightBookingPublicService,
    FlightCheckoutSessionService,
    SelectedOfferCacheService,
    FlightBookingRepoPortToken,
    FlightBookingExtraRepoPortToken,
    FlightOfferSnapshotService,
  ],
})
export class FlightsModule implements OnModuleInit {
  constructor(
    private readonly registry: FlightsProviderRegistryService,
    private readonly manualFlightProvider: ManualFlightProvider,
    private readonly bookingRegistry: FlightBookingProviderRegistryService,
    private readonly manualFlightBookingProvider: ManualFlightBookingProvider,
  ) {}

  onModuleInit() {
    // Only the manual flight provider is registered in this starter kit —
    // real GDS/NDC supplier integrations (Travelport, Duffel, Amadeus) were
    // intentionally removed. Search/booking always resolves to the manual
    // catalog; the registry pattern is unchanged, so a real provider can be
    // registered here again later without touching any calling code.
    this.registry.register(this.manualFlightProvider);
    this.bookingRegistry.register(this.manualFlightBookingProvider);
  }
}
