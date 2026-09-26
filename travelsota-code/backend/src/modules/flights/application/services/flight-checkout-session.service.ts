import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../../../shared/cache/cache.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { TravelportAncillaryService } from './travelport-ancillary.service';
import { TravelportBookingWorkflowService } from './travelport-booking-workflow.service';
import { SelectedOfferCacheService } from './selected-offer-cache.service';
import type { AncillaryCatalogOption } from '../../domain/entities/ancillary-catalog.types';
import { MEAL_SSR_CODES } from '../../domain/entities/ancillary-catalog.types';
import type { FlightCheckoutSessionDto } from '../../api/dto/flight-checkout-session.dto';
import type {
  CheckoutSessionResponse,
  CheckoutSessionPriceBreakdown,
  CachedCheckoutSession,
} from '../../domain/entities/checkout-session.types';
import { CHECKOUT_SESSION_CACHE_PREFIX, CHECKOUT_SESSION_TTL_SECONDS } from '../../domain/entities/checkout-session.types';
import { randomUUID } from 'node:crypto';

@Injectable()
export class FlightCheckoutSessionService {
  private readonly logger = new Logger(FlightCheckoutSessionService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: AppConfigService,
    private readonly selectedOfferCache: SelectedOfferCacheService,
    private readonly ancillaryService: TravelportAncillaryService,
    private readonly bookingWorkflowService: TravelportBookingWorkflowService,
  ) {}

  async createCheckoutSession(input: FlightCheckoutSessionDto): Promise<CheckoutSessionResponse> {
    const { searchKey, offerId, travelers, from, to, departureDate, tripType, returnDate } = input;
    const normalizedOfferId = decodeURIComponent(offerId);
    const sessionKey = `${CHECKOUT_SESSION_CACHE_PREFIX}:${randomUUID()}`;

    const expiresAt = new Date(
      Date.now() + CHECKOUT_SESSION_TTL_SECONDS * 1000,
    ).toISOString();

    try {
      // 1. Load the selected offer cache entry (build from search if missing)
      let cachedEntry = await this.selectedOfferCache.retrieve(searchKey, normalizedOfferId);
      if (!cachedEntry) {
        this.logger.log(`[CheckoutSession] Selected-offer cache miss — rebuilding from search cache`);
        cachedEntry = await this.ancillaryService.buildCacheFromSearchIfMissing(
          searchKey, normalizedOfferId, travelers.length,
        );
        if (!cachedEntry) {
          return {
            ok: false,
            sessionKey,
            searchKey,
            offerId: normalizedOfferId,
            contentSource: 'NDC',
            expiresAt,
            priceBreakdown: { baseFare: 0, taxes: 0, total: 0, currency: 'USD', perTraveler: [] },
            ancillaryCatalog: {
              seats: [], baggage: [], services: [], meals: [],
              unavailableReasons: {
                seats: 'Selected offer not found.',
                baggage: 'Selected offer not found.',
                services: 'Selected offer not found.',
                meals: 'Selected offer not found.',
              },
            },
          };
        }
      }

      const contentSource = (cachedEntry.contentSource ?? 'GDS') as 'NDC' | 'GDS';
      this.logger.log(`[CheckoutSession] CachedEntry: catalogUuid=${cachedEntry.catalogUuid} productSelections=${JSON.stringify(cachedEntry.productSelections)} contentSource=${contentSource}`);

      // 2. Price the offer using buildfromproducts and get priced offer identifiers
      this.logger.log(`[CheckoutSession] Pricing offer ${normalizedOfferId}`);
      let priceTotal = 0;
      let currency = 'USD';
      let baseFare = 0;
      let taxes = 0;
      let pricedOfferIdentifierValue: string | undefined;
      let pricedOfferIdentifierAuthority: string | undefined;

      try {
        const priceResult = await this.bookingWorkflowService.priceForCheckoutSession(
          searchKey, normalizedOfferId,
        );
        priceTotal = priceResult.amount;
        currency = priceResult.currency;
        baseFare = priceResult.amount;
        pricedOfferIdentifierValue = priceResult.pricedOfferIdentifierValue;
        pricedOfferIdentifierAuthority = priceResult.pricedOfferIdentifierAuthority;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn(`[CheckoutSession] Pricing failed: ${msg}.`);
      }

      if (priceTotal <= 0) {
        this.logger.error(`[CheckoutSession] No valid price obtained — returning error`);
        return {
          ok: false,
          sessionKey,
          searchKey,
          offerId: normalizedOfferId,
          contentSource: 'NDC',
          expiresAt,
          priceBreakdown: { baseFare: 0, taxes: 0, total: 0, currency: 'USD', perTraveler: [] },
          ancillaryCatalog: {
            seats: [], baggage: [], services: [], meals: [],
            unavailableReasons: {
              seats: 'Pricing failed.',
              baggage: 'Pricing failed.',
              services: 'Pricing failed.',
              meals: 'Pricing failed.',
            },
          },
        };
      }

      // 3. Shop ancillaries via the unified catalog path (AirPrice → BuildFromOfferList)
      this.logger.log(`[CheckoutSession] Shopping ancillaries via catalog path`);
      let baggage: AncillaryCatalogOption[] = [];
      let services: AncillaryCatalogOption[] = [];

      try {
        const ancillaryCatalog = await this.ancillaryService.ancillaryCatalog({
          searchKey,
          offerId: normalizedOfferId,
          travelerCount: travelers.length,
        });
        baggage = ancillaryCatalog.baggage ?? [];
        services = ancillaryCatalog.services ?? [];
        this.logger.log(
          `[CheckoutSession] Got ${baggage.length} baggage, ${services.length} services from catalog path`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn(`[CheckoutSession] Catalog ancillary shop failed: ${msg}`);
      }

      // 4. Build meal SSR options (same as catalog preview)
      const meals: AncillaryCatalogOption[] = MEAL_SSR_CODES.map((ssr) => ({
        id: `specialservices:meal:${ssr.code}`,
        type: 'meal' as const,
        source: 'specialservices' as const,
        label: ssr.name,
        description: ssr.description,
        price: { amount: 0, currency: 'USD' },
        requiresSupplierConfirmation: true,
        quantityMin: 0,
        quantityMax: 1,
        supplier: { ssrCode: ssr.code },
      }));
      this.logger.log(`[CheckoutSession] Built ${meals.length} meal SSR options: ${meals.map((m) => `${m.supplier?.ssrCode ?? '?'}`).join(', ')}`);

      // 5. Build price breakdown
      const priceBreakdown: CheckoutSessionPriceBreakdown = {
        baseFare,
        taxes,
        total: priceTotal,
        currency,
        perTraveler: travelers.map((_, i) => ({
          travelerIndex: i,
          baseFare: Math.round((baseFare / travelers.length) * 100) / 100,
          taxes: Math.round((taxes / travelers.length) * 100) / 100,
          total: Math.round((priceTotal / travelers.length) * 100) / 100,
        })),
      };

      // 6. Build the response
      const ancillaryCatalog = {
        seats: [] as AncillaryCatalogOption[],
        baggage,
        services,
        meals,
        unavailableReasons: {
          seats: 'Seat selection during checkout not yet implemented.',
          baggage: baggage.length === 0 ? 'No baggage options available from supplier.' : undefined,
          services: services.length === 0 ? 'No service options available from supplier.' : undefined,
          meals: undefined,
        },
      };

      const response: CheckoutSessionResponse = {
        ok: true,
        sessionKey,
        searchKey,
        offerId: normalizedOfferId,
        contentSource,
        expiresAt,
        priceBreakdown,
        ancillaryCatalog,
      };

      // 7. Cache the session
      const cachedSession: CachedCheckoutSession = {
        sessionKey,
        searchKey,
        offerId: normalizedOfferId,
        catalogUuid: cachedEntry.catalogUuid,
        productIds: cachedEntry.productSelections.flatMap((s) => s.productIds),
        productSelections: cachedEntry.productSelections,
        contentSource,
        priceBreakdown,
        ancillaryCatalog,
        cachedAt: new Date().toISOString(),
        expiresAt,
      };
      await this.cacheService.set(sessionKey, cachedSession, CHECKOUT_SESSION_TTL_SECONDS);

      this.logger.log({
        message: '[CheckoutSession] Created',
        sessionKey: sessionKey.slice(-12),
        searchKey: searchKey.slice(-8),
        offerId: normalizedOfferId.slice(0, 16) + '...',
        priceTotal,
        currency,
        baggage: baggage.length,
        services: services.length,
        meals: meals.length,
        pricedOfferIdentifier: pricedOfferIdentifierValue ? `${pricedOfferIdentifierValue.slice(0, 16)}...` : 'MISSING',
        ttlSeconds: CHECKOUT_SESSION_TTL_SECONDS,
        expiresAt,
      });

      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[CheckoutSession] Failed to create: ${msg}`);

      return {
        ok: false,
        sessionKey,
        searchKey,
        offerId: normalizedOfferId,
        contentSource: 'NDC',
        expiresAt,
        priceBreakdown: { baseFare: 0, taxes: 0, total: 0, currency: 'USD', perTraveler: [] },
        ancillaryCatalog: {
          seats: [], baggage: [], services: [], meals: [],
          unavailableReasons: {
            seats: 'Checkout session creation failed.',
            baggage: msg,
            services: msg,
            meals: 'Checkout session creation failed.',
          },
        },
      };
    }
  }

  async retrieveCheckoutSession(sessionKey: string): Promise<CachedCheckoutSession | null> {
    return this.cacheService.get<CachedCheckoutSession>(sessionKey);
  }

}
