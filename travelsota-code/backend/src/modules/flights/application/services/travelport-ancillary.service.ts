import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CacheService } from '../../../../shared/cache/cache.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import type { TravelportRuntimeConfig } from '../../../../shared/config/app-config.types';
import { HttpClientService } from '../../../../shared/http/http-client.service';
import { ProviderConfigService } from '../../../settings/application/services/provider-config.service';
import { SelectedOfferCacheService } from './selected-offer-cache.service';
import { TravelportPayloadBuilderService } from './travelport-payload-builder.service';
import { AncillaryCatalogParserService } from './ancillary-catalog-parser.service';
import { TravelportSeatMapBuilderService } from './travelport-seat-map-builder.service';
import { sanitizeForLog } from './flight-log.util';
import type {
  NormalizedFlightSearchResponse,
  NormalizedFlightOffer,
  SelectedOfferCacheEntry,
} from '../../domain/entities/flight-search-response';
import type {
  AncillaryCatalogResponse,
  AncillaryCatalogOption,
  QuoteWorkbenchContext,
  CachedCatalog,
  AncillaryCatalogInput,
} from '../../domain/entities/ancillary-catalog.types';
import {
  MEAL_SSR_CODES,
  ANCILLARY_CATALOG_CACHE_PREFIX,
  ANCILLARY_CATALOG_TTL_SECONDS,
} from '../../domain/entities/ancillary-catalog.types';

interface TravelportTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

@Injectable()
export class TravelportAncillaryService {
  private readonly logger = new Logger(TravelportAncillaryService.name);
  constructor(
    private readonly configService: AppConfigService,
    private readonly httpClient: HttpClientService,
    private readonly cacheService: CacheService,
    private readonly providerConfigService: ProviderConfigService,
    private readonly selectedOfferCache: SelectedOfferCacheService,
    private readonly payloadBuilder: TravelportPayloadBuilderService,
    private readonly catalogParser: AncillaryCatalogParserService,
    private readonly seatMapBuilder: TravelportSeatMapBuilderService,
  ) {}

  /**
   * Phase 3 — Unified Ancillary Catalog
   *
   * Creates a temporary quote workbench, fetches seat availability + ancillary shop
   * options + meal SSR codes, and returns a normalized AncillaryCatalogResponse.
   *
   * Flow:
   * 1. Retrieve selected offer cache
   * 2. Create temporary reservation workbench
   * 3. Add placeholder travelers (no real PII)
   * 4. Add the main flight offer
   * 5. Extract workbench identifiers from response
   * 6. Call seat availability for seats section
   * 7. Call ancillary shop for baggage/services
   * 8. Build meal SSR options from configured codes
   * 9. Cache the normalized catalog response
   * 10. Return unified response (never commit the quote workbench)
   */
  async ancillaryCatalog(
    input: AncillaryCatalogInput,
  ): Promise<AncillaryCatalogResponse> {
    const { searchKey, offerId, travelerCount } = input;
    const normalizedOfferId = decodeURIComponent(offerId);
    const cacheKey = `${ANCILLARY_CATALOG_CACHE_PREFIX}:${searchKey}:${normalizedOfferId}:${travelerCount}`;

    // 0. Check cache first
    const cached = await this.cacheService.get<CachedCatalog>(cacheKey);
    if (cached?.response) {
      this.logger.log(`[Catalog] Cache hit for ${cacheKey}`);
      return cached.response;
    }
    this.logger.log(`[Catalog] Cache miss for ${cacheKey}`);

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + ANCILLARY_CATALOG_TTL_SECONDS * 1000,
    ).toISOString();

    // 1. Retrieve selected offer cache
    const cachedEntry = await this.buildCacheFromSearchIfMissing(
      searchKey,
      normalizedOfferId,
      travelerCount,
    );
    if (!cachedEntry) {
      return {
        ok: false,
        searchKey,
        offerId: normalizedOfferId,
        contentSource: 'NDC',
        expiresAt,
        seats: [],
        baggage: [],
        services: [],
        meals: [],
        unavailableReasons: {
          seats: 'Selected offer not found in cache.',
          baggage: 'Selected offer not found in cache.',
          services: 'Selected offer not found in cache.',
          meals: 'Selected offer not found in cache.',
        },
      };
    }

    const contentSource = (cachedEntry.contentSource ?? 'GDS') as 'NDC' | 'GDS';
    const isNdc = contentSource === 'NDC';

    // 2. Create reservation workbench
    this.logger.log(`[Catalog] Creating workbench, cs=${contentSource}`);
    const session = await this.createWorkbenchSession();
    if (!session?.workbenchId) {
      this.logger.warn(`[Catalog] Workbench creation returned null`);
      return this.buildCatalogWithError(
        searchKey,
        normalizedOfferId,
        contentSource,
        expiresAt,
        {
          seats: 'Unable to create quote workbench.',
          baggage: 'Unable to create quote workbench.',
          services: 'Unable to create quote workbench.',
          meals: 'Unable to create quote workbench.',
        },
      );
    }
    this.logger.log(`[Catalog] Workbench OK: ${session.workbenchId.slice(0, 12)}...`);

    // 3. Add the main flight offer using all product selections at once
    // Phase 9: Single add-main-offer call with all outbound/inbound selections,
    // rather than looping per-selection. Includes AccessGroup for NDC.
    const workbenchCtx: QuoteWorkbenchContext = {
      workbenchId: session.workbenchId,
      sessionId: session.sessionId,
      offerIdentifiers: [],
      travelerIdentifiers: [],
    };

    if (cachedEntry.productSelections.length > 0) {
      const allSelectionsOk = await this.addOfferToWorkbench(
        session.workbenchId,
        session.sessionId,
        cachedEntry.catalogUuid,
        cachedEntry.productSelections,
        travelerCount,
        isNdc,
      );

      if (!allSelectionsOk) {
        this.logger.warn(
          `[Catalog] Failed to add main offer to quote workbench — returning unavailable`,
        );
        return this.buildCatalogWithError(
          searchKey,
          normalizedOfferId,
          contentSource,
          expiresAt,
          {
            seats: 'Unable to add the main flight offer to the workbench.',
            baggage: 'Unable to add the main flight offer to the workbench.',
            services: 'Unable to add the main flight offer to the workbench.',
            meals: 'Unable to add the main flight offer to the workbench.',
          },
        );
      }
    }
    this.logger.log(`[Catalog] Offer added to workbench OK`);

    // 4. Add placeholder travelers (after main offer, so they aren't lost)
    const travelerIds: string[] = [];
    for (let i = 0; i < travelerCount; i++) {
      const travelerId = `qt_trav_${i + 1}`;
      const ok = await this.addPlaceholderTraveler(
        session.workbenchId,
        session.sessionId,
        travelerId,
        i + 1,
      );
      if (ok) {
        travelerIds.push(travelerId);
      } else {
        this.logger.warn(
          `[Catalog] Failed to add traveler ${travelerId}, continuing`,
        );
      }
    }

    if (travelerIds.length === 0) {
      return this.buildCatalogWithError(
        searchKey,
        normalizedOfferId,
        contentSource,
        expiresAt,
        {
          seats: 'Unable to add travelers to quote workbench.',
          baggage: 'Unable to add travelers to quote workbench.',
          services: 'Unable to add travelers to quote workbench.',
          meals: 'Unable to add travelers to quote workbench.',
        },
      );
    }
    workbenchCtx.travelerIdentifiers = travelerIds;

    // 5. Build sections
    const seats: AncillaryCatalogOption[] = [];
    const baggage: AncillaryCatalogOption[] = [];
    const services: AncillaryCatalogOption[] = [];
    const meals: AncillaryCatalogOption[] = [];
    const unavailableReasons: AncillaryCatalogResponse['unavailableReasons'] =
      {};

    // 6+7. Run seat availability and ancillary shop in PARALLEL
    this.logger.log(`[Catalog] Seat + ancillary shop in parallel (isNdc=${isNdc})`);

    const buildSeatBody = (): { body: unknown; url: string; options: { softFail?: boolean; debugLog?: boolean; includeAccessGroup?: boolean } } => {
      if (isNdc) {
        return {
          body: this.buildSeatAvailabilityBodyForNdc(
            cachedEntry.catalogUuid,
            cachedEntry.productSelections,
          ),
          url: `/search/seat/catalogofferingsancillaries/seatavailabilities`,
          options: { softFail: true, includeAccessGroup: true, debugLog: true },
        };
      } else {
        return {
          body: this.seatMapBuilder.buildGdsFromProducts(cachedEntry),
          url: `/search/seat/catalogofferingsancillaries/seatavailabilities`,
          options: { softFail: true, includeAccessGroup: true },
        };
      }
    };

    // Fire both in parallel
    const [seatPromise, ancillaryShopPromise] = await Promise.allSettled([
      // 6. Seat availability
      (async () => {
        const { body: seatBody, url: seatUrl, options: seatOptions } = buildSeatBody();
        const seatResult = await this.requestAir('POST', seatUrl, seatBody, seatOptions);
        return seatResult as Record<string, unknown>;
      })(),
      // 7. AncillaryShop (baggage + services)
      // NDC: direct from workbench (BuildFromReservationWorkbench)
      // GDS: price first, then shop from priced offer (BuildFromOfferList)
      (async () => {
        if (isNdc) {
          return this.shopAncillariesFromWorkbench(
            session.workbenchId,
            session.sessionId,
          );
        }

        // GDS: price the offer standalone (not on workbench), then shop
        // from the priced offer. Matches the Postman flow exactly:
        // POST /air/price/offers/buildfromproducts → OfferListIdentifier → AncillaryShop
        const priceBody = this.payloadBuilder.buildFromProducts(cachedEntry);
        let offerListId: string | null = null;
        let pricedId: string | null = null;

        try {
          const priceResult = await this.requestAir(
            'POST',
            '/price/offers/buildfromproducts',
            priceBody,
            { softFail: true, sessionId: session.sessionId, debugLog: true, includeAccessGroup: true },
          );
          const pr = priceResult as Record<string, unknown>;

          if (pr?.ok === false) {
            this.logger.warn(
              `[AncillaryShop] Standalone pricing failed: ${(pr.message as string) ?? 'unknown'} (code=${(pr.sourceCode as string) ?? '?'})`,
            );
          } else {
            const olr = pr.OfferListResponse as Record<string, unknown> | undefined;
            offerListId = ((olr?.Identifier as Record<string, unknown>)?.value as string) ?? null;
            const offers = (olr?.OfferID as Array<Record<string, unknown>>) ?? [];
            const firstOffer = offers[0] as Record<string, unknown> | undefined;
            pricedId = (firstOffer?.Identifier as Record<string, unknown>)?.value as string
              ?? (firstOffer?.value as string)
              ?? (firstOffer?.id as string)
              ?? null;

            this.logger.warn(
              `[AncillaryShop] Priced OK: listId=${offerListId?.slice(0, 12)}... offerId=${pricedId ?? 'null'} offers=${offers.length}`,
            );
          }
        } catch (err: unknown) {
          this.logger.warn(`[AncillaryShop] Standalone pricing threw: ${err instanceof Error ? err.message : String(err)}`);
        }

        if (offerListId && pricedId) {
          this.logger.log(`[AncillaryShop] Standalone pricing OK — shopping ancillaries`);
          return this.shopAncillariesFromOfferList(
            session.workbenchId,
            session.sessionId,
            offerListId,
            pricedId,
          );
        }

        this.logger.warn(`[AncillaryShop] Standalone pricing returned no usable identifiers — ancillaries unavailable`);
        return { baggage: [] as AncillaryCatalogOption[], services: [] as AncillaryCatalogOption[] };
      })(),
    ]);

    // Process seat results
    if (seatPromise.status === 'fulfilled') {
      const seatRaw = seatPromise.value;
      if (seatRaw?.ok === false) {
        this.logger.warn(`[Catalog] Seat availability returned error: ${seatRaw.message}`);
        unavailableReasons.seats =
          this.readString(seatRaw.message) ?? 'Seat map unavailable from Travelport.';
      } else {
        const seatOptionsList = this.catalogParser.parseAncillaryShopResponse(
          seatRaw, 'seatavailability', true,
        );
        const seatCount = seatOptionsList.filter((o) => o.type === 'seat').length;
        this.logger.log(`[Catalog] Seat availability parsed: ${seatCount} seat options`);
        seats.push(...seatOptionsList.filter((o) => o.type === 'seat'));
        baggage.push(...seatOptionsList.filter((o) => o.type === 'baggage'));
        services.push(...seatOptionsList.filter(
          (o) => !['seat', 'baggage', 'meal'].includes(o.type),
        ));
      }
    } else {
      this.logger.warn(`[Catalog] Seat availability failed: ${seatPromise.reason}`);
      unavailableReasons.seats = 'Seat map temporarily unavailable.';
    }

    // Process ancillary shop results (baggage + services)
    if (ancillaryShopPromise.status === 'fulfilled' && ancillaryShopPromise.value) {
      const ancillaryResult = ancillaryShopPromise.value;
      baggage.push(...ancillaryResult.baggage);
      services.push(...ancillaryResult.services);

      if (baggage.length === 0) {
        unavailableReasons.baggage =
          'No paid baggage options available for this fare. Included baggage is shown during checkout.';
      }

      this.logger.log(
        `[Catalog] AncillaryShop returned: ${ancillaryResult.baggage.length} baggage, ${ancillaryResult.services.length} services`,
      );
    } else {
      const reason = ancillaryShopPromise.status === 'rejected' ? ancillaryShopPromise.reason : 'AncillaryShop returned no data';
      this.logger.warn(`[Catalog] AirPrice + AncillaryShop failed: ${reason}`);
      if (isNdc) {
        unavailableReasons.baggage = 'Baggage options are available during checkout.';
        unavailableReasons.services = 'Additional services are available during checkout.';
      } else {
        unavailableReasons.baggage = 'Baggage selection is not yet available for GDS offers.';
        unavailableReasons.services = 'Additional services are not yet available for GDS offers.';
      }
    }

    // 8. Build meal SSR options
    meals.push(...this.buildMealSsrOptions());
    if (meals.length === 0) {
      unavailableReasons.meals =
        'Meal options are not available for this offer.';
    }

    // 9. Build final response
    this.logger.warn(
      `[Catalog] Done: seats=${seats.length} bag=${baggage.length} svc=${services.length} meals=${meals.length} ` +
      `seatErr=${unavailableReasons.seats ?? '-'} bagErr=${unavailableReasons.baggage ?? '-'}`,
    );
    const catalogResponse: AncillaryCatalogResponse = {
      ok: true,
      searchKey,
      offerId: normalizedOfferId,
      contentSource,
      expiresAt,
      seats,
      baggage,
      services,
      meals,
      unavailableReasons,
      // includedBaggage for Travelport is derived from the fare's search result
      // and passed via URL param from the result card (short-term fix).
      // TODO: derive from cachedEntry referenceList when fare baggage data is available
    };

    // 10. Cache the response
    const cachedCatalog: CachedCatalog = {
      response: catalogResponse,
      workbench: workbenchCtx,
      cachedAt: now.toISOString(),
      expiresAt,
    };
    await this.cacheService.set(
      cacheKey,
      cachedCatalog,
      ANCILLARY_CATALOG_TTL_SECONDS,
    );

    // 10b. Enhanced Phase 8 logging — trace IDs, option counts, cache metadata, no PII
    this.logger.log({
      message: '[Catalog] Built and cached ancillary catalog',
      searchKey: searchKey.slice(-8),
      offerId: normalizedOfferId.slice(0, 16) + '...',
      contentSource,
      seats: seats.length,
      baggage: baggage.length,
      services: services.length,
      meals: meals.length,
      cacheKey: cacheKey.slice(0, 32) + '...',
      ttlSeconds: ANCILLARY_CATALOG_TTL_SECONDS,
      expiresAt,
      workbenchId: session.workbenchId
        ? session.workbenchId.slice(0, 8) + '...'
        : undefined,
      traceId: workbenchCtx.traceId,
      transactionId: workbenchCtx.transactionId,
      unavailableSeats: !!unavailableReasons.seats,
      unavailableBaggage: !!unavailableReasons.baggage,
      unavailableMeals: !!unavailableReasons.meals,
    });

    // Phase 8: Fire-and-forget discard of the temporary quote workbench.
    // Never commit quote workbenches — if discard fails, the session will expire.
    this.discardQuoteWorkbench(session.workbenchId, session.sessionId);

    return catalogResponse;
  }

  /** Build a catalog response with all sections unavailable (workbench-level failure) */
  private buildCatalogWithError(
    searchKey: string,
    offerId: string,
    contentSource: 'NDC' | 'GDS',
    expiresAt: string,
    reasons: Record<string, string>,
    okFlag = false,
  ): AncillaryCatalogResponse {
    return {
      ok: okFlag,
      searchKey,
      offerId,
      contentSource,
      expiresAt,
      seats: [],
      baggage: [],
      services: [],
      meals: [],
      unavailableReasons: {
        seats: reasons.seats ?? 'Ancillary catalog unavailable.',
        baggage: reasons.baggage ?? 'Ancillary catalog unavailable.',
        services: reasons.services ?? 'Ancillary catalog unavailable.',
        meals: reasons.meals ?? 'Ancillary catalog unavailable.',
      },
    };
  }

  /**
   * Build meal SSR options from configured SSR codes.
   *
   * Phase 8: Meals are SSR-based requests/preferences, not paid ancillaries.
   * Price is always 0 — these are requests sent to the airline, not purchases.
   * Use `requiresSupplierConfirmation: true` to indicate the airline must confirm.
   * Failure to add meals is non-fatal and does not block booking.
   */
  private buildMealSsrOptions(): AncillaryCatalogOption[] {
    const options = MEAL_SSR_CODES.map((ssr) => ({
      id: `specialservices:meal:${ssr.code}`,
      type: 'meal' as const,
      source: 'specialservices' as const,
      label: ssr.name,
      description: ssr.description,
      price: { amount: 0, currency: 'USD' },
      requiresSupplierConfirmation: true,
      quantityMin: 0,
      quantityMax: 1,
      supplier: {
        ssrCode: ssr.code,
      },
    }));
    this.logger.log(
      `[MealSSR] Built ${options.length} meal options: ${options.map((o) => `${o.supplier?.ssrCode ?? '?'}=${o.label}`).join(', ')}`,
    );
    return options;
  }

  /**
   * Phase 6 — Re-shop seat availability from the real booking workbench.
   * Calls the seat availability endpoint and returns fresh seat options
   * with updated supplier identifiers. Best-effort — returns empty array
   * on failure so the caller can fall back to original selections.
   */
  async reshopSeatsInWorkbench(
    catalogUuid: string,
    productSelections: Array<{ offeringId: string; productIds: string[] }>,
    contentSource: 'NDC' | 'GDS',
    cachedEntry: SelectedOfferCacheEntry | null,
    bookingWorkbenchId?: string,
    bookingSessionId?: string,
  ): Promise<AncillaryCatalogOption[]> {
    this.logger.log(
      `[ReshopSeats] Re-shopping seats for ${catalogUuid.slice(0, 8)}... (workbench=${bookingWorkbenchId?.slice(0, 8) ?? 'none'})`,
    );
    const options: AncillaryCatalogOption[] = [];

    try {
      let body: unknown;
      let requestOptions: {
        softFail?: boolean;
        debugLog?: boolean;
        includeAccessGroup?: boolean;
        sessionId?: string;
      };

      if (contentSource === 'NDC') {
        body = this.buildSeatAvailabilityBodyForNdc(
          catalogUuid,
          productSelections,
        );
        requestOptions = { softFail: true, includeAccessGroup: true };
      } else if (
        cachedEntry?.referenceList?.flights &&
        Object.keys(cachedEntry.referenceList.flights).length > 0
      ) {
        // GDS Method A: BuildFromProducts (direct flight criteria)
        body = this.seatMapBuilder.buildGdsFromProducts(cachedEntry);
        requestOptions = { softFail: true, includeAccessGroup: true };
      } else {
        body = this.buildSeatAvailabilityBodyForNdc(
          catalogUuid,
          productSelections,
        );
        requestOptions = { softFail: true, includeAccessGroup: false };
      }

      // Use the booking workbench's session ID if available
      if (bookingSessionId) {
        requestOptions.sessionId = bookingSessionId;
      }

      const result = await this.requestAir(
        'POST',
        '/search/seat/catalogofferingsancillaries/seatavailabilities',
        body,
        requestOptions,
      );
      const raw = result as Record<string, unknown>;

      if (raw?.ok === false) {
        this.logger.warn(`[ReshopSeats] Seat re-shop failed: ${raw.message}`);
        return options;
      }

      const parsed = this.catalogParser.parseAncillaryShopResponse(
        raw,
        'seatavailability',
        true,
      );
      options.push(...parsed.filter((o) => o.type === 'seat'));

      this.logger.log(`[ReshopSeats] Got ${options.length} fresh seat options`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`[ReshopSeats] Seat re-shop failed: ${msg}`);
    }

    return options;
  }

  /**
   * Checkout Session — Shop ancillaries from a priced offer using BuildFromOffer.
   *
   * Unlike `reshopShopInWorkbench` which requires a committed reservation workbench,
   * this method uses the `AncillaryOfferingsBuildFromOffer` payload that works
   * directly from the priced offer identifiers without a workbench.
   *
   * This is used by the checkout session flow where the offer has been priced
   * but not yet added to a workbench.
   */
  /**
   * @deprecated Ancillary shop from priced offer is a pre-workbench approach that often
   * returns empty results because Travelport requires a reservation workbench context for
   * meaningful ancillary availability. Use `reshopShopInWorkbench()` instead, which operates
   * on a committed reservation workbench with real traveler data.
   *
   * This method is kept for the checkout session flow where the offer has been priced
   * but not yet added to a workbench. Results are best-effort and often empty in test environments.
   * Phase 6+ should migrate to workbench-based ancillary shop.
   */
  async shopAncillariesFromPricedOffer(
    pricedOfferIdentifierValue: string,
    pricedOfferIdentifierAuthority: string | undefined,
    productIds: string[],
  ): Promise<{
    baggage: AncillaryCatalogOption[];
    services: AncillaryCatalogOption[];
  }> {
    this.logger.warn(
      `[ShopFromPricedOffer] DEPRECATED — use reshopShopInWorkbench() instead. Shopping ancillaries for priced offer ${pricedOfferIdentifierValue.slice(0, 16)}...`,
    );
    const result: {
      baggage: AncillaryCatalogOption[];
      services: AncillaryCatalogOption[];
    } = { baggage: [], services: [] };

    try {
      const body = {
        '@type': 'CatalogOfferingsQueryAncillaries',
        AncillaryOfferings: {
          '@type': 'AncillaryOfferingsBuildFromOffer',
          BuildFromOffer: {
            '@type': 'BuildFromOfferAir',
            OfferIdentifier: [
              {
                Identifier: {
                  value: pricedOfferIdentifierValue,
                  ...(pricedOfferIdentifierAuthority
                    ? { authority: pricedOfferIdentifierAuthority }
                    : {}),
                },
              },
            ],
            ProductIdentifier: productIds.map((pid) => ({
              Identifier: {
                value: pid,
              },
            })),
          },
        },
      };

      const shopResult = await this.requestAir(
        'POST',
        '/ancillaryshop/catalogofferingsancillaries',
        body,
        { softFail: true, includeAccessGroup: true, debugLog: true },
      );

      const raw = shopResult as Record<string, unknown>;
      if (raw?.ok === false) {
        this.logger.warn(
          `[ShopFromPricedOffer] Ancillary shop failed: ${raw.message}`,
        );
        if (raw.upstreamResponse) {
          this.logger.warn(
            `[ShopFromPricedOffer] upstreamResponse=${JSON.stringify(raw.upstreamResponse).slice(0, 1000)}`,
          );
        }
        return result;
      }

      const options = this.catalogParser.parseAncillaryShopResponse(
        raw,
        'ancillaryshop',
      );
      result.baggage = options.filter((o) => o.type === 'baggage');
      result.services = options.filter(
        (o) => !['seat', 'baggage', 'meal'].includes(o.type),
      );

      this.logger.log(
        `[ShopFromPricedOffer] Got ${result.baggage.length} baggage, ${result.services.length} service options (total parsed: ${options.length})`,
      );

      // Log raw top-level keys and snippet when results are unexpectedly empty
      if (result.baggage.length === 0 && result.services.length === 0) {
        const topKeys =
          raw && typeof raw === 'object' ? Object.keys(raw).join(', ') : 'N/A';
        const snippet = JSON.stringify(raw).slice(0, 2000);
        this.logger.warn(
          `[ShopFromPricedOffer] Empty results — raw topKeys=[${topKeys}] snippet=${snippet}`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(
        `[ShopFromPricedOffer] Ancillary shop from priced offer failed: ${msg}`,
      );
    }

    return result;
  }

  /**
   * Phase 6 — Re-shop ancillary services using the real booking workbench.
   * Calls the ancillary shop endpoint on the real workbench and returns
   * fresh baggage and service options. Best-effort — returns empty arrays
   * on failure so the caller can fall back to original selections.
   */
  async reshopShopInWorkbench(
    workbenchId: string,
    sessionId?: string,
  ): Promise<{
    baggage: AncillaryCatalogOption[];
    services: AncillaryCatalogOption[];
  }> {
    this.logger.log(
      `[ReshopShop] Re-shopping ancillaries for workbench ${workbenchId.slice(0, 8)}...`,
    );
    const result: {
      baggage: AncillaryCatalogOption[];
      services: AncillaryCatalogOption[];
    } = { baggage: [], services: [] };

    try {
      const body = this.buildAncillaryShopBody(workbenchId);
      const shopResult = await this.requestAir(
        'POST',
        '/ancillaryshop/catalogofferingsancillaries',
        body,
        { softFail: true, includeAccessGroup: true, sessionId },
      );

      const raw = shopResult as Record<string, unknown>;
      if (raw?.ok === false) {
        this.logger.warn(
          `[ReshopShop] Ancillary shop re-shop failed: ${raw.message}`,
        );
        return result;
      }

      const options = this.catalogParser.parseAncillaryShopResponse(
        raw,
        'ancillaryshop',
      );
      result.baggage = options.filter((o) => o.type === 'baggage');
      result.services = options.filter(
        (o) => !['seat', 'baggage', 'meal'].includes(o.type),
      );

      this.logger.log(
        `[ReshopShop] Got ${result.baggage.length} fresh baggage, ${result.services.length} fresh service options`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`[ReshopShop] Ancillary shop re-shop failed: ${msg}`);
    }

    return result;
  }

  /**
   * Price the workbench offers to get an OfferListIdentifier and priced OfferIdentifier.
   * This is required before calling AncillaryShop with BuildFromOfferList.
   *
   * Returns the offerListIdentifier and pricedOfferId needed for the ancillary shop call.
   * Returns null if pricing fails.
   */
  private async airPriceOnWorkbench(
    _workbenchId: string,
    sessionId: string | undefined,
    cachedEntry: SelectedOfferCacheEntry,
    travelerCount: number,
  ): Promise<{ offerListIdentifier: string; pricedOfferId: string } | null> {
    try {
      const priceBody = {
        '@type': 'OfferQueryBuildFromCatalogProductOfferings',
        BuildFromCatalogProductOfferingsRequest: {
          '@type': 'BuildFromCatalogProductOfferingsRequestAir',
          CatalogProductOfferingsIdentifier: {
            Identifier: {
              value: cachedEntry.catalogUuid,
              authority: 'Travelport',
            },
          },
          CatalogProductOfferingSelection: cachedEntry.productSelections.map((sel) => {
            const catalogOfferingId = sel.offeringId.includes(':')
              ? sel.offeringId.split(':')[0]
              : sel.offeringId;
            return {
              '@type': 'CatalogProductOfferingSelection',
              CatalogProductOfferingIdentifier: {
                Identifier: { value: catalogOfferingId, authority: 'Travelport' },
              },
              ProductIdentifier: sel.productIds.map((pid) => ({
                Identifier: { value: pid, authority: 'Travelport' },
              })),
            };
          }),
          PassengerCriteria: [
            {
              '@type': 'PassengerCriteria',
              number: travelerCount > 0 ? travelerCount : 1,
              passengerTypeCode: 'ADT',
            },
          ],
        },
      };

      const priceResult = await this.requestAir(
        'POST',
        `/price/offers/buildfromcatalogproductofferings`,
        priceBody,
        { softFail: true, sessionId, includeAccessGroup: true },
      );

      const raw = priceResult as Record<string, unknown>;

      // Check for Travelport errors in 200 response
      if (raw?.ok === false) {
        this.logger.warn(`[AirPrice] Price failed: ${raw.message}`);
        return null;
      }

      // Extract OfferListIdentifier and first OfferIdentifier
      const offerListResponse = raw?.OfferListResponse as Record<string, unknown> | undefined;
      if (!offerListResponse) {
        this.logger.warn(`[AirPrice] No OfferListResponse in price result`);
        return null;
      }

      const offerListIdentifier = this.readString(
        (offerListResponse.Identifier as Record<string, unknown>)?.value,
      );

      const rawOfferIds = offerListResponse.OfferID;
      const offerIdArray: Record<string, unknown>[] = Array.isArray(rawOfferIds)
        ? rawOfferIds
        : rawOfferIds
          ? [rawOfferIds as Record<string, unknown>]
          : [];
      const pricedOfferId = offerIdArray.length > 0
        ? this.readString(offerIdArray[0].id) ?? ''
        : '';

      if (!offerListIdentifier || !pricedOfferId) {
        this.logger.warn(
          `[AirPrice] Missing identifiers: offerListId=${offerListIdentifier ?? '(none)'} offerId=${pricedOfferId || '(none)'}`,
        );
        return null;
      }

      this.logger.log(
        `[AirPrice] Priced successfully: offerListId=${offerListIdentifier.slice(0, 16)}... offerId=${pricedOfferId.slice(0, 16)}...`,
      );
      return { offerListIdentifier, pricedOfferId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`[AirPrice] Failed: ${msg}`);
      return null;
    }
  }

  /**
   * Shop ancillaries directly from catalog product offerings (no pricing step).
   * Uses BuildFromCatalogProductOfferings — GDS fallback when airPriceOnWorkbench fails.
   */
  private async shopAncillariesFromCatalog(
    _workbenchId: string,
    sessionId: string | undefined,
    catalogUuid: string,
    productSelections: Array<{ offeringId: string; productIds: string[] }>,
  ): Promise<{
    baggage: AncillaryCatalogOption[];
    services: AncillaryCatalogOption[];
  }> {
    const result: { baggage: AncillaryCatalogOption[]; services: AncillaryCatalogOption[] } = { baggage: [], services: [] };
    try {
      const body = {
        '@type': 'CatalogOfferingsQueryAncillaries',
        AncillaryOfferings: {
          '@type': 'AncillaryOfferingsBuildFromCatalogProductOfferings',
          BuildFromCatalogProductOfferingsRequest: {
            '@type': 'BuildFromCatalogProductOfferingsRequestAir',
            CatalogProductOfferingsIdentifier: { Identifier: { value: catalogUuid } },
            CatalogProductOfferingSelection: productSelections.map((sel) => ({
              CatalogProductOfferingIdentifier: { id: sel.offeringId },
              ProductIdentifier: sel.productIds.map((pid) => ({ id: pid })),
            })),
          },
        },
      };
      const shopResult = await this.requestAir('POST', '/ancillaryshop/catalogofferingsancillaries', body, { softFail: true, sessionId, debugLog: true, includeAccessGroup: true });
      const raw = shopResult as Record<string, unknown>;
      if (raw?.ok === false) { this.logger.warn(`[AncillaryShop] Catalog shop failed: ${raw.message}`); return result; }
      const resultError = this.extractTravelportResponseErrors(raw);
      if (resultError) { this.logger.warn(`[AncillaryShop] Catalog shop error: ${resultError.message}`); return result; }
      const options = this.catalogParser.parseAncillaryShopResponse(raw, 'ancillaryshop');
      result.baggage = options.filter((o) => o.type === 'baggage');
      result.services = options.filter((o) => !['seat', 'baggage', 'meal'].includes(o.type));
      this.logger.log(`[AncillaryShop] Catalog shop: ${result.baggage.length} baggage, ${result.services.length} services`);
    } catch (err: unknown) {
      this.logger.warn(`[AncillaryShop] Catalog shop failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    return result;
  }

  /**
   * Shop ancillaries using BuildFromOfferList after AirPrice.
   *
   * Body shape:
   * ```json
   * {
   *   "@type": "CatalogOfferingsQueryAncillaries",
   *   "AncillaryOfferings": {
   *     "@type": "AncillaryOfferingsBuildFromOfferList",
   *     "BuildFromOfferList": {
   *       "OfferListIdentifier": "...",
   *       "OfferIdentifier": [{ "id": "..." }]
   *     }
   *   }
   * }
   * ```
   */
  private async shopAncillariesFromWorkbench(
    workbenchId: string,
    sessionId: string | undefined,
  ): Promise<{
    baggage: AncillaryCatalogOption[];
    services: AncillaryCatalogOption[];
  }> {
    const result: {
      baggage: AncillaryCatalogOption[];
      services: AncillaryCatalogOption[];
    } = { baggage: [], services: [] };

    try {
      const body = {
        '@type': 'CatalogOfferingsQueryAncillaries',
        AncillaryOfferings: {
          '@type': 'AncillaryOfferingsBuildFromReservationWorkbench',
          BuildFromReservationWorkbench: {
            ReservationIdentifier: {
              Identifier: {
                value: workbenchId,
              },
            },
          },
        },
      };

      const shopResult = await this.requestAir(
        'POST',
        '/ancillaryshop/catalogofferingsancillaries',
        body,
        { softFail: true, sessionId, debugLog: true, includeAccessGroup: true },
      );

      const raw = shopResult as Record<string, unknown>;

      if (raw?.ok === false) {
        this.logger.warn(
          `[AncillaryShop] Ancillary shop failed: ${raw.message}`,
        );
        return result;
      }

      const resultError = this.extractTravelportResponseErrors(
        raw as Record<string, unknown> | undefined,
      );
      if (resultError) {
        this.logger.warn(
          `[AncillaryShop] Travelport returned error: ${resultError.message} (sourceCode=${resultError.sourceCode})`,
        );
        return result;
      }

      const options = this.catalogParser.parseAncillaryShopResponse(
        raw,
        'ancillaryshop',
      );
      result.baggage = options.filter((o) => o.type === 'baggage');
      result.services = options.filter(
        (o) => !['seat', 'baggage', 'meal'].includes(o.type),
      );

      const typeCounts: Record<string, number> = {};
      for (const o of options) { typeCounts[o.type] = (typeCounts[o.type] ?? 0) + 1; }
      this.logger.warn(
        `[AncillaryShop] Parsed ${options.length} products (bag=${result.baggage.length} svc=${result.services.length}): ${Object.entries(typeCounts).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}`,
      );

      if (result.baggage.length === 0 && result.services.length === 0) {
        const topKeys =
          raw && typeof raw === 'object' ? Object.keys(raw).join(', ') : 'N/A';
        const snippet = JSON.stringify(raw).slice(0, 2000);
        this.logger.warn(
          `[AncillaryShop] Empty results — raw topKeys=[${topKeys}] snippet=${snippet}`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`[AncillaryShop] Ancillary shop failed: ${msg}`);
    }

    return result;
  }

  /**
   * Shop ancillaries from a priced offer using BuildFromOfferList.
   *
   * Used in checkout/reservation flow where an OfferListIdentifier is available
   * from the workbench pricing step.
   *
   * Request:
   * ```json
   * {
   *   "@type": "CatalogOfferingsQueryAncillaries",
   *   "AncillaryOfferings": {
   *     "@type": "AncillaryOfferingsBuildFromOfferList",
   *     "BuildFromOfferList": {
   *       "OfferListIdentifier": "...",
   *       "OfferIdentifier": [{ "id": "..." }]
   *     }
   *   }
   * }
   * ```
   */
  private async shopAncillariesFromOfferList(
    workbenchId: string,
    sessionId: string | undefined,
    offerListIdentifier: string,
    pricedOfferId: string,
  ): Promise<{
    baggage: AncillaryCatalogOption[];
    services: AncillaryCatalogOption[];
  }> {
    const result: {
      baggage: AncillaryCatalogOption[];
      services: AncillaryCatalogOption[];
    } = { baggage: [], services: [] };

    try {
      const body = {
        '@type': 'CatalogOfferingsQueryAncillaries',
        AncillaryOfferings: {
          '@type': 'AncillaryOfferingsBuildFromOfferList',
          BuildFromOfferList: {
            OfferListIdentifier: offerListIdentifier,
            OfferIdentifier: [{ id: pricedOfferId }],
          },
        },
      };

      const shopResult = await this.requestAir(
        'POST',
        '/ancillaryshop/catalogofferingsancillaries',
        body,
        { softFail: true, includeAccessGroup: true, sessionId, debugLog: true },
      );

      const raw = shopResult as Record<string, unknown>;

      // Check for Travelport Result.Error in 200 response
      if (raw?.ok === false) {
        this.logger.warn(
          `[AncillaryShop] Ancillary shop failed: ${raw.message}`,
        );
        return result;
      }

      // Check for Result.Error at the response level
      const resultError = this.extractTravelportResponseErrors(
        raw as Record<string, unknown> | undefined,
      );
      if (resultError) {
        this.logger.warn(
          `[AncillaryShop] Travelport returned error: ${resultError.message} (sourceCode=${resultError.sourceCode})`,
        );
        return result;
      }

      const options = this.catalogParser.parseAncillaryShopResponse(
        raw,
        'ancillaryshop',
      );
      result.baggage = options.filter((o) => o.type === 'baggage');
      result.services = options.filter(
        (o) => !['seat', 'baggage', 'meal'].includes(o.type),
      );

      const typeCounts: Record<string, number> = {};
      for (const o of options) { typeCounts[o.type] = (typeCounts[o.type] ?? 0) + 1; }
      this.logger.warn(
        `[AncillaryShop] Parsed ${options.length} products (bag=${result.baggage.length} svc=${result.services.length}): ${Object.entries(typeCounts).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}`,
      );

      if (result.baggage.length === 0 && result.services.length === 0) {
        const topKeys =
          raw && typeof raw === 'object' ? Object.keys(raw).join(', ') : 'N/A';
        const snippet = JSON.stringify(raw).slice(0, 2000);
        this.logger.warn(
          `[AncillaryShop] Empty results — raw topKeys=[${topKeys}] snippet=${snippet}`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`[AncillaryShop] Ancillary shop failed: ${msg}`);
    }

    return result;
  }

  /**
   * Phase 8 — Fire-and-forget discard of a temporary quote workbench.
   *
   * Temporary quote workbenches must never be committed. Travelport sessions
   * expire automatically, but this endpoint provides an explicit discard
   * for faster resource cleanup.
   *
   * Failures are logged but not thrown — discarding is best-effort.
   */
  private async discardQuoteWorkbench(
    workbenchId: string,
    sessionId?: string,
  ): Promise<void> {
    try {
      const config = await this.resolveConfig();
      const token = await this.getAccessToken(config);
      const url = `${config.baseUrl}/book/airoffer/reservationworkbench/${encodeURIComponent(workbenchId)}/offers/canceloffer`;
      await this.httpClient.request(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          ...(sessionId ? { Cookie: `httpOnlyCookie=${sessionId}` } : {}),
        },
        body: JSON.stringify({}),
        responseType: 'json',
        timeoutMs: 5000,
      });
      this.logger.debug(
        `[Catalog] Quote workbench ${workbenchId.slice(0, 8)}... discard sent`,
      );
    } catch {
      // Best-effort cleanup — workbench will expire naturally
      this.logger.debug(
        `[Catalog] Quote workbench ${workbenchId.slice(0, 8)}... cleanup failed; ignoring`,
      );
    }
  }

  /**
   * Build the ancillary shop request body using the reservation workbench.
   *
   * Matches the V11 NDC collection's ancillary shop payload:
   * ```json
   * {
   *   "@type": "CatalogOfferingsQueryAncillaries",
   *   "AncillaryOfferings": {
   *     "@type": "AncillaryOfferingsBuildFromReservationWorkbench",
   *     "BuildFromReservationWorkbench": {
   *       "ReservationIdentifier": {
   *         "Identifier": { "value": "{reservationId}" }
   *       }
   *     }
   *   }
   * }
   * ```
   */
  private buildAncillaryShopBody(workbenchId: string): unknown {
    return {
      '@type': 'CatalogOfferingsQueryAncillaries',
      AncillaryOfferings: {
        '@type': 'AncillaryOfferingsBuildFromReservationWorkbench',
        BuildFromReservationWorkbench: {
          ReservationIdentifier: {
            Identifier: {
              value: workbenchId,
            },
          },
        },
      },
    };
  }

  /**
   * Add a placeholder traveler to the workbench using a unique traveler ID.
   * Uses safe placeholder values only — no real PII in the quote workbench.
   */
  private async addPlaceholderTraveler(
    workbenchId: string,
    sessionId: string | undefined,
    travelerId: string,
    sequence: number,
  ): Promise<boolean> {
    try {
      const travelerBody = {
        '@type': 'Traveler',
        gender: sequence % 2 === 0 ? 'Female' : 'Male',
        birthDate: '1990-01-15',
        id: travelerId,
        TravelerRef: travelerId,
        passengerTypeCode: 'ADT',
        PersonName: {
          '@type': 'PersonNameDetail',
          Given: `Guest${sequence}`,
          Surname: 'Traveler',
        },
        Telephone: [
          {
            '@type': 'Telephone',
            countryAccessCode: '1',
            phoneNumber: `555${String(1000 + sequence).slice(1)}000${sequence}`,
            id: `tel_${travelerId}`,
            role: 'Mobile',
          },
        ],
        Email: [
          {
            id: `email_${travelerId}`,
            value: `guest${sequence}@placeholder.local`,
          },
        ],
      };
      await this.requestAir(
        'POST',
        `/book/traveler/reservationworkbench/${encodeURIComponent(workbenchId)}/travelers`,
        travelerBody,
        { sessionId, includeAccessGroup: true },
      );
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(
        `[Catalog] addPlaceholderTraveler failed for ${travelerId}: ${msg}`,
      );
      return false;
    }
  }

  /**
   * Build ancillary offers within a reservation workbench (for booking).
   * Creates a temporary workbench, adds a traveler and the main offer,
   * then prices ancillaries using the proven workbench-based endpoint.
   */
  async ancillaryPrice(payload: unknown) {
    const extracted = this.extractAncillaryPayload(payload);
    if (!extracted) {
      return {
        ok: false,
        message: 'Could not extract ancillary products from request.',
      };
    }

    const {
      catalogUuid,
      offeringId,
      mainProductIds,
      ancillaryProductIds,
      travelerCount,
    } = extracted;

    // Step 1: Create a temporary workbench
    const session = await this.createWorkbenchSession();
    if (!session?.workbenchId) {
      return { ok: false, message: 'Failed to create workbench session.' };
    }

    // Step 2: Add a generic traveler to the workbench
    const travelerOk = await this.addTravelerToWorkbench(
      session.workbenchId,
      session.sessionId,
    );
    if (!travelerOk) {
      return { ok: false, message: 'Failed to add traveler to workbench.' };
    }

    // Step 3: Add the main offer using main flight product IDs
    const offerOk = await this.addOfferToWorkbench(
      session.workbenchId,
      session.sessionId,
      catalogUuid,
      [{ offeringId, productIds: mainProductIds }],
      travelerCount,
    );
    if (!offerOk) {
      return { ok: false, message: 'Failed to add offer to workbench.' };
    }

    // Step 4: Price ancillaries using ancillary product IDs (seat/baggage)
    // Note: Travelport requires specific product IDs — it doesn't support "get all" ancillaries.
    // When no IDs are provided, return unavailable so the frontend falls back to synthetic data.
    if (ancillaryProductIds.length === 0) {
      return { ok: false, message: 'No ancillary product IDs provided.' };
    }

    const ancillaryBody = this.buildAncillaryPriceBody(
      catalogUuid,
      offeringId,
      ancillaryProductIds,
      travelerCount,
    );
    return this.requestAir(
      'POST',
      `/book/airoffer/reservationworkbench/${encodeURIComponent(session.workbenchId)}/offers/buildancillaryoffersfromcatalogofferings`,
      ancillaryBody,
      { softFail: true, sessionId: session.sessionId },
    );
  }

  /**
   * Creates a temporary workbench session for ancillary pricing.
   * Returns the workbenchId and sessionId.
   */
  private async createWorkbenchSession(): Promise<{
    workbenchId: string;
    sessionId?: string;
  } | null> {
    try {
      const response = await this.requestAir(
        'POST',
        '/book/session/reservationworkbench',
        { '@type': 'ReservationID' },
        { includeAccessGroup: true, debugLog: true },
      );
      const root = response as {
        ReservationResponse?: {
          Reservation?: { Identifier?: { value?: string } };
          SessionIdentifier?: string;
        };
        Identifier?: { value?: string };
        Reservation?: { Identifier?: { value?: string } };
      };
      const reservation = root?.ReservationResponse?.Reservation;
      const workbenchId =
        reservation?.Identifier?.value ??
        root?.Identifier?.value ??
        root?.Reservation?.Identifier?.value;
      const sessionId = root?.ReservationResponse?.SessionIdentifier;

      if (!workbenchId) {
        this.logger.warn(
          `[TravelportAncillary] createWorkbenchSession: no workbenchId in response — keys: ${Object.keys(root).join(',')}, snippet: ${JSON.stringify(root).slice(0, 500)}`,
        );
        return null;
      }
      return { workbenchId, sessionId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[TravelportAncillary] createWorkbenchSession failed: ${msg}`,
      );
      return null;
    }
  }

  /**
   * Adds a generic traveler to the workbench (required for workbench-based operations).
   */
  private async addTravelerToWorkbench(
    workbenchId: string,
    sessionId?: string,
  ): Promise<boolean> {
    try {
      const travelerBody = {
        '@type': 'Traveler',
        gender: 'Male',
        birthDate: '1990-05-15',
        id: 'travelerRefId_1',
        TravelerRef: 'travelerRefId_1',
        passengerTypeCode: 'ADT',
        PersonName: {
          '@type': 'PersonNameDetail',
          Given: 'Guest',
          Surname: 'Traveler',
        },
        Telephone: [
          {
            '@type': 'Telephone',
            countryAccessCode: '92',
            phoneNumber: '3001234567',
            id: 'telephone_1',
            role: 'Mobile',
          },
        ],
        Email: [{ id: 'email_1', value: 'guest@example.com' }],
      };
      await this.requestAir(
        'POST',
        `/book/traveler/reservationworkbench/${encodeURIComponent(workbenchId)}/travelers`,
        travelerBody,
        { sessionId },
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Adds the main flight offer to the workbench.
   */
  private async addOfferToWorkbench(
    workbenchId: string,
    sessionId: string | undefined,
    catalogUuid: string,
    productSelections: Array<{ offeringId: string; productIds: string[] }>,
    travelerCount: number,
    _isNdc = false,
  ): Promise<boolean> {
    try {
      const offerBody = {
        '@type': 'OfferQueryBuildFromCatalogProductOfferings',
        BuildFromCatalogProductOfferingsRequest: {
          '@type': 'BuildFromCatalogProductOfferingsRequestAir',
          CatalogProductOfferingsIdentifier: {
            Identifier: {
              value: catalogUuid,
            },
          },
          CatalogProductOfferingSelection: productSelections.map((sel) => ({
            CatalogProductOfferingIdentifier: {
              id: sel.offeringId,
            },
            ProductIdentifier: sel.productIds.map((value) => ({
              id: value,
            })),
          })),
          PassengerCriteria: [
            {
              '@type': 'PassengerCriteria',
              number: travelerCount > 0 ? travelerCount : 1,
              passengerTypeCode: 'ADT',
            },
          ],
        },
      };
      await this.requestAir(
        'POST',
        `/book/airoffer/reservationworkbench/${encodeURIComponent(workbenchId)}/offers/buildfromcatalogproductofferings`,
        offerBody,
        { sessionId, includeAccessGroup: true },
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build a SelectedOfferCacheEntry from the cached search response when
   * the selected-offer cache misses. This allows ancillary preview endpoints
   * (seat map, baggage, meals) to work even when the user hasn't gone through
   * the checkout preview flow, e.g. when viewing offer details directly.
   *
   * If the cache entry already exists, returns it directly.
   * If it doesn't exist, reads the search cache, finds the matching offer,
   * builds the entry, stores it, and returns it.
   * Returns null if the search cache is missing or the offer can't be found.
   */
  async buildCacheFromSearchIfMissing(
    searchKey: string,
    offerId: string,
    travelerCount?: number,
  ): Promise<SelectedOfferCacheEntry | null> {
    // Normalize offerId first so cache keys are consistent regardless of encoding
    const normalizedOfferId = decodeURIComponent(offerId);

    // First, try the existing cache using the normalized ID
    const existing = await this.selectedOfferCache.retrieve(
      searchKey,
      normalizedOfferId,
    );
    if (existing) return existing;

    // Cache miss — try to build from the search cache
    try {
      const cacheKey = `flight-search:${searchKey}:provider:travelport`;
      const cachedSearch =
        await this.cacheService.get<NormalizedFlightSearchResponse>(cacheKey);
      if (!cachedSearch) {
        this.logger.warn(
          `[CacheBuild] Cache miss for key: ${cacheKey}`,
        );
        return null;
      }

      const { meta, offers } = cachedSearch;
      const matchedOffer = offers.find(
        (o: NormalizedFlightOffer) =>
          o.metadata?.offeringId === normalizedOfferId ||
          o.id === normalizedOfferId,
      );
      if (!matchedOffer) {
        this.logger.warn(
          `[CacheBuild] Offer ${normalizedOfferId} not found in cached search`,
        );
        return null;
      }

      // Prefer the offer's own provider-level catalogUuid. In combined NDC+GDS
      // searches, meta.catalogUuid may be the GDS identifier (spread-order overwrite),
      // so the matched offer's providerCatalogUuid is authoritative.
      const catalogUuid =
        matchedOffer.metadata?.providerCatalogUuid ??
        (matchedOffer.contentSource && meta?.providerContexts?.[matchedOffer.contentSource as 'NDC' | 'GDS']?.catalogUuid) ??
        meta?.catalogUuid;
      if (!catalogUuid) {
        this.logger.warn('[CacheBuild] No catalogUuid for matched offer');
        return null;
      }

      // `?? []` alone doesn't catch the common case where the normalizer set
      // productRefs but left productSelections as an already-empty array
      // (not undefined) — check .length so the productRefs fallback actually
      // fires for those offers instead of silently keeping the empty array.
      const productSelections =
        matchedOffer.metadata?.productSelections?.length
          ? matchedOffer.metadata.productSelections
          : matchedOffer.metadata?.productRefs?.length
            ? [
                {
                  offeringId:
                    matchedOffer.metadata?.catalogOfferingId ??
                    matchedOffer.metadata?.offeringId ??
                    normalizedOfferId.split(':')[0],
                  productIds: matchedOffer.metadata.productRefs,
                },
              ]
            : [];

      if (productSelections.length === 0) {
        this.logger.warn('[CacheBuild] No product selections found for offer');
        return null;
      }

      // Determine the actual content source priority:
      // 1. Use matchedOffer.contentSource when set (most reliable)
      // 2. If undefined, consult providerContexts: if GDS provider has referenceList with the offer's
      //    product refs -> 'GDS', else if GDS provider context has catalogUuid -> 'GDS',
      //    else if only NDC provider context exists -> 'NDC'
      // 3. Final fallback: 'GDS' (safest default)
      const resolveContentSource = (): 'GDS' | 'NDC' => {
        if (matchedOffer.contentSource) {
          return matchedOffer.contentSource as 'GDS' | 'NDC';
        }
        const providerContexts = meta?.providerContexts;
        // Check if the offer's product refs exist in the GDS reference list
        if (providerContexts?.GDS?.referenceList?.products) {
          const gdsProductKeys = Object.keys(providerContexts.GDS.referenceList.products);
          const offerRefs = matchedOffer.metadata?.productRefs
            ?? (matchedOffer.metadata?.productRef ? [matchedOffer.metadata.productRef] : []);
          if (offerRefs.some((ref) => gdsProductKeys.includes(ref))) {
            return 'GDS';
          }
        }
        if (providerContexts?.GDS?.catalogUuid) {
          return 'GDS';
        }
        if (providerContexts?.NDC?.catalogUuid && !providerContexts?.GDS) {
          return 'NDC';
        }
        return 'GDS';
      };
      const effectiveContentSource = resolveContentSource();

      // For merged NDC+GDS searches, the top-level meta.referenceList belongs
      // to whichever channel was spread last (usually NDC) — the offer's own
      // channel keeps its reference list under meta.providerContexts[source].
      // Falling back to the top-level list here silently starved GDS offers
      // of their flight reference data, sending previewSeatMap() down the
      // NDC-shaped fallback body and producing "seat map not available" for
      // exactly the GDS offers whose search happened to include NDC results.
      // See flight-booking-public.service.ts's referenceListForSource() for
      // the same fix applied to the booking-preview cache path.
      const sourceContext = meta?.providerContexts?.[effectiveContentSource] as
        | { referenceList?: SelectedOfferCacheEntry['referenceList'] }
        | undefined;
      const sourceReferenceList = sourceContext?.referenceList;

      const cacheEntry: SelectedOfferCacheEntry = {
        catalogUuid,
        offeringIds: productSelections.map((s) => s.offeringId),
        productRefs: productSelections.flatMap((s) => s.productIds),
        productSelections,
        brandOfferingId: matchedOffer.metadata?.brandOfferingId,
        combinabilityCode: matchedOffer.metadata?.combinabilityCode,
        contentSource: effectiveContentSource,
        supplierPrice: matchedOffer.price
          ? { amount: matchedOffer.price.total, currency: matchedOffer.price.currency }
          : undefined,
        passengerCriteria: [
          { number: travelerCount ?? 1, passengerTypeCode: 'ADT' },
        ],
        referenceList: {
          products: sourceReferenceList?.products ?? meta?.referenceList?.products ?? {},
          flights: sourceReferenceList?.flights ?? meta?.referenceList?.flights ?? {},
          brands: sourceReferenceList?.brands ?? meta?.referenceList?.brands,
        },
        searchCriteria: {
          from: cachedSearch.request?.from ?? '',
          to: cachedSearch.request?.to ?? '',
          departureDate: cachedSearch.request?.departureDate ?? '',
          tripType: cachedSearch.request?.tripType,
          returnDate: cachedSearch.request?.returnDate,
          cabinClass: cachedSearch.request?.cabinClass,
          adults: cachedSearch.request?.adults ?? 1,
        },
        // V2: Populated from matched offer contentSource
        workflowKind: effectiveContentSource === 'NDC' ? 'ndc' : 'gds',
        capabilities: {
          seatMapAvailable: true,
          ancillaryShopAvailable: effectiveContentSource === 'NDC',
          mealSsrSupported: true,
          postBookingManageAvailable: false,
        },
      };

      await this.selectedOfferCache.store('travelport',
        searchKey,
        normalizedOfferId,
        cacheEntry,
      );
      this.logger.log(
        `[CacheBuild] Built and cached offer ${normalizedOfferId} for search ${searchKey}`,
      );
      return cacheEntry;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[CacheBuild] Failed to build cache from search: ${message}`,
      );
      return null;
    }
  }

  /**
   * Preview seat map using cached selected offer context.
   * No temporary workbench needed — reads identifiers from cache
   * and uses the Post-Price seat availability endpoint.
   * Automatically builds the cache from search response if missing.
   */
  async previewSeatMap(
    searchKey: string,
    offerId: string,
    travelerCount?: number,
  ) {
    const cachedEntry = await this.buildCacheFromSearchIfMissing(
      searchKey,
      offerId,
      travelerCount,
    );
    if (!cachedEntry) {
      return { ok: false, message: 'Selected offer not found in cache.' };
    }

    const catalogUuid = cachedEntry.catalogUuid;
    const productSelections = cachedEntry.productSelections;

    this.logger.log(
      `[SeatMap] catalogUuid=%s offeringIds=%j contentSource=%s`,
      catalogUuid?.slice(0, 20),
      productSelections?.map((s) => s.offeringId),
      cachedEntry.contentSource,
    );

    if (!catalogUuid || productSelections.length === 0) {
      return {
        ok: false,
        message: 'Insufficient data in cached offer for seat map.',
      };
    }

    const contentSource = cachedEntry.contentSource ?? 'GDS';
    const isNdc = contentSource === 'NDC';

    let body: unknown;
    let url: string;
    let requestOptions: {
      softFail?: boolean;
      debugLog?: boolean;
      includeAccessGroup?: boolean;
    };

    if (isNdc) {
      // NDC: Build body with per-selection product mappings (no query params)
      body = this.buildSeatAvailabilityBodyForNdc(
        catalogUuid,
        productSelections,
      );
      url = `/search/seat/catalogofferingsancillaries/seatavailabilities`;
      requestOptions = {
        softFail: true,
        debugLog: true,
        includeAccessGroup: true,
      };
      this.logger.log(
        `[SeatMap][NDC] selections=${productSelections.map((s) => `${s.offeringId}:${s.productIds.join(',')}`).join(' | ')}`,
      );
    } else if (
      cachedEntry.referenceList?.flights &&
      Object.keys(cachedEntry.referenceList.flights).length > 0
    ) {
      // GDS: Use BuildFromProducts with specific flight criteria from reference list
      body = this.seatMapBuilder.buildGdsFromProducts(cachedEntry);
      url = `/search/seat/catalogofferingsancillaries/seatavailabilities`;
      requestOptions = {
        softFail: true,
        debugLog: true,
        includeAccessGroup: false,
      };
      this.logger.log(
        `[SeatMap][GDS] Using BuildFromProducts (flight criteria from reference list)`,
      );
    } else {
      // Fallback: use CatalogProductOfferings format (handles multiple selections, no reference list needed)
      body = this.buildSeatAvailabilityBodyForNdc(
        catalogUuid,
        productSelections,
      );
      url = `/search/seat/catalogofferingsancillaries/seatavailabilities`;
      requestOptions = {
        softFail: true,
        debugLog: true,
        includeAccessGroup: false,
      };
      this.logger.log(
        `[SeatMap][Fallback] Using BuildFromCatalogProductOfferings format (no flight reference data)`,
      );
    }

    this.logger.log(
      `[SeatMap][Cache] searchKey=${searchKey} offerId=${offerId} contentSource=${contentSource}`,
    );

    return this.requestAir('POST', url, body, requestOptions);
  }

  async buildAncillaryOffers(workbenchId: string, payload: unknown) {
    return this.requestAir(
      'POST',
      `/book/airoffer/reservationworkbench/${encodeURIComponent(workbenchId)}/offers/buildancillaryoffersfromcatalogofferings`,
      payload,
    );
  }

  async cancelAncillaryOffer(workbenchId: string, payload: unknown) {
    return this.requestAir(
      'POST',
      `/book/airoffer/reservationworkbench/${encodeURIComponent(workbenchId)}/offers/canceloffer`,
      payload,
    );
  }

  async getEmdsByLocator(locator: string) {
    return this.requestAir(
      'GET',
      `/emds/getbylocator?locator=${encodeURIComponent(locator)}`,
    );
  }

  async getEmd(identifier: string) {
    return this.requestAir('GET', `/emds/${encodeURIComponent(identifier)}`);
  }

  async updateEmd(identifier: string, payload: unknown) {
    return this.requestAir(
      'PUT',
      `/emds/${encodeURIComponent(identifier)}`,
      payload,
    );
  }

  private async requestAir(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
    options?: {
      softFail?: boolean;
      sessionId?: string;
      debugLog?: boolean;
      includeAccessGroup?: boolean;
    },
  ) {
    const config = await this.resolveConfig();
    const token = await this.getAccessToken(config);
    const baseUrl = `${config.baseUrl}/${config.acceptVersion}/air`;
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.access_token}`,
      'Accept-Version': config.acceptVersion,
      'Content-Version': config.contentVersion,
    };

    if (options?.includeAccessGroup && config.accessGroup) {
      headers['XAUTH_TRAVELPORT_ACCESSGROUP'] = config.accessGroup;
    }

    if (config.pcc) {
      const gds = config.gds ?? '1G';
      headers['TVP-PCC-CORE'] =
        `${config.pcc.toUpperCase()}_${gds.toUpperCase()}`;
    }

    if (options?.sessionId) {
      headers['travelportPlusSessionIdentifier'] = options.sessionId;
    }

    const response = await this.httpClient.request(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      responseType: 'json',
      timeoutMs: config.requestTimeoutMs,
    });

    // Log full response for debug requests (PII-sanitized)
    if (options?.debugLog) {
      const sanitized = sanitizeForLog(response.data);
      const responseData =
        typeof sanitized === 'string'
          ? sanitized
          : sanitized
            ? JSON.stringify(sanitized, null, 2)
            : '(empty)';
      this.logger.log(
        `[TravelportResponse] ${url}\n${responseData.slice(0, 5000)}`,
      );
    }

    // Even on HTTP 200, Travelport may embed errors in the response body.
    if (response.ok && options?.softFail) {
      const responseData = response.data as Record<string, unknown> | undefined;
      const travelportErrors =
        this.extractTravelportResponseErrors(responseData);
      if (travelportErrors) {
        if (options?.debugLog) {
          const sanitized = sanitizeForLog(responseData);
          const dataStr = sanitized
            ? JSON.stringify(sanitized, null, 2).slice(0, 5000)
            : '(empty)';
          this.logger.log(`[TravelportResponse] ${url}\n${dataStr}`);
        }
        this.logger.warn(
          `[Ancillary] Travelport returned error in 200 response: ${travelportErrors.message} (sourceCode=${travelportErrors.sourceCode})`,
        );
        return travelportErrors;
      }
    }

    if (!response.ok) {
      const upstreamResponse =
        typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data ?? null);
      if (
        options?.softFail &&
        response.status >= 400 &&
        response.status < 500
      ) {
        this.logger.warn(
          `Ancillary upstream 4xx: ${response.status} ${url} body=${JSON.stringify(body).slice(0, 500)}`,
        );
        return {
          ok: false,
          upstreamStatus: response.status,
          upstreamResponse,
          data: [],
        };
      }

      const responseSnippet =
        typeof response.data === 'string'
          ? response.data.slice(0, 2000)
          : JSON.stringify(response.data ?? null).slice(0, 2000);
      this.logger.error(
        `Ancillary upstream failure: ${response.status} ${url} body=${JSON.stringify(body).slice(0, 500)} response=${responseSnippet}`,
      );
      throw new InternalServerErrorException(
        `Travelport ancillary request failed (${response.status})`,
      );
    }

    return response.data;
  }

  /**
   * Build the seat availability body using the active reservation workbench.
   *
   * Uses SeatAvailabilityOfferingsBuildFromReservationWorkbench to query seat
   * availability from the active booking workbench context. This is the correct
   * body for during-booking seat re-shopping because it uses the workbench's
   * actual flight segments rather than stale pre-booking catalog identifiers.
   */
  private buildSeatAvailabilityBodyForWorkbench(
    workbenchId: string,
    offerId?: string,
    productIds?: string[],
  ) {
    const context: Record<string, unknown> = {
      ReservationIdentifier: {
        Identifier: { value: workbenchId },
      },
    };
    if (offerId) {
      context.OfferIdentifier = {
        Identifier: { value: offerId, authority: 'Travelport' },
      };
    }
    if (productIds?.length) {
      context.ProductIdentifier = productIds.map((pid) => ({
        Identifier: { value: pid },
      }));
    }
    return {
      '@type': 'CatalogOfferingsQuerySeatAvailability',
      SeatAvailabilityOfferings: {
        '@type': 'SeatAvailabilityOfferingsBuildFromReservationWorkbench',
        BuildFromReservationWorkbench: context,
      },
    };
  }

  /**
   * Build the seat availability request body for the GDS full payload path.
   *
   * Uses SeatAvailabilityOfferingsBuildFromCatalogProductOfferings — the same
   * body type as NDC. This works for both NDC and GDS pre-booking seat preview.
   * The body includes the catalogUuid and product selections from the cached offer.
   */
  private buildSeatAvailabilityBodyForGds(cacheEntry: SelectedOfferCacheEntry) {
    return this.buildSeatAvailabilityBodyForNdc(
      cacheEntry.catalogUuid,
      cacheEntry.productSelections,
    );
  }

  /**
   * Build the seat availability request body using BuildFromOfferList (Method B).
   *
   * This is used in the post-price / checkout path where an OfferListIdentifier
   * has been returned from the pricing step. Instead of constructing
   * ProductCriteriaAir from the reference list, it references the offer
   * and product identifiers directly.
   *
   * Matches the V11 GDS Full Payload collection post-price seat availability format:
   * ```json
   * {
   *   "@type": "CatalogOfferingsQuerySeatAvailability",
   *   "SeatAvailabilityOfferings": {
   *     "@type": "SeatAvailabilityOfferingsBuildFromOfferList",
   *     "BuildFromOfferList": {
   *       "OfferListIdentifier": "{offerListId}",
   *       "OfferIdentifier": [{ "id": "{offerId}" }],
   *       "ProductIdentifier": [{ "id": "{productId}" }]
   *     }
   *   }
   * }
   * ```
   */
  buildSeatAvailabilityBodyForGdsFromOfferList(
    offerListIdentifier: string,
    offerId: string,
    productIds: string[],
  ): unknown {
    return {
      '@type': 'CatalogOfferingsQuerySeatAvailability',
      SeatAvailabilityOfferings: {
        '@type': 'SeatAvailabilityOfferingsBuildFromOfferList',
        BuildFromOfferList: {
          '@type': 'BuildFromOfferListAir',
          OfferListIdentifier: offerListIdentifier,
          OfferIdentifier: [
            {
              id: offerId,
            },
          ],
          ProductIdentifier: productIds.map((pid) => ({
            id: pid,
          })),
        },
      },
    };
  }

  /**
   * Build the seat availability request body for the NDC reference path.
   */
  private buildSeatAvailabilityBodyForNdc(
    catalogUuid: string,
    productSelections: Array<{ offeringId: string; productIds: string[] }>,
  ) {
    return {
      '@type': 'CatalogOfferingsQuerySeatAvailability',
      SeatAvailabilityOfferings: {
        '@type': 'SeatAvailabilityOfferingsBuildFromCatalogProductOfferings',
        BuildFromCatalogProductOfferingsRequest: {
          '@type': 'BuildFromCatalogProductOfferingsRequest',
          CatalogProductOfferingsIdentifier: {
            Identifier: {
              value: catalogUuid,
              authority: 'Travelport',
            },
          },
          CatalogProductOfferingSelection: productSelections.map((sel) => ({
            '@type': 'CatalogProductOfferingSelection',
            CatalogProductOfferingIdentifier: {
              id: sel.offeringId,
            },
            ProductIdentifier: sel.productIds.map((productId) => ({
              id: productId,
            })),
          })),
        },
      },
    };
  }

  /**
   * Fallback: Build the request body using the legacy `BuildFromOfferList` format.
   */
  private buildAncillaryPriceBody(
    catalogUuid: string,
    offeringId: string,
    productIds: string[],
    travelerCount: number,
  ) {
    const selection: Record<string, unknown> = {
      CatalogProductOfferingIdentifier: {
        Identifier: {
          value: offeringId,
        },
      },
    };

    if (productIds.length > 0) {
      selection.ProductIdentifier = productIds.map((value) => ({
        Identifier: {
          value,
        },
      }));
    }

    return {
      '@type': 'OfferQueryBuildAncillaryOffersFromCatalogOfferings',
      BuildAncillaryOffersFromCatalogOfferingsRequest: {
        '@type': 'BuildAncillaryOffersFromCatalogOfferingsRequestAir',
        CatalogProductOfferingsIdentifier: {
          Identifier: {
            value: catalogUuid,
            authority: 'Travelport',
          },
        },
        CatalogProductOfferingSelection: [selection],
        PassengerCriteria: [
          {
            '@type': 'PassengerCriteria',
            number: travelerCount > 0 ? travelerCount : 1,
            passengerTypeCode: 'ADT',
          },
        ],
      },
    };
  }

  private async resolveConfig(): Promise<TravelportRuntimeConfig> {
    const envDefaults = this.configService.travelport;
    const runtime =
      await this.providerConfigService.getFlightsProviderRuntime('travelport');
    return {
      ...envDefaults,
      ...(runtime.config as Partial<TravelportRuntimeConfig>),
    };
  }

  private async getAccessToken(
    config: TravelportRuntimeConfig,
  ): Promise<TravelportTokenResponse> {
    const cacheKey = this.buildTokenCacheKey(config);
    const cachedToken =
      await this.cacheService.get<TravelportTokenResponse>(cacheKey);

    if (cachedToken?.access_token) {
      return cachedToken;
    }

    const form = new URLSearchParams();
    form.set('grant_type', config.oauthGrantType);
    form.set('username', config.username ?? '');
    form.set('password', config.password ?? '');

    if (config.oauthClientAuthMode === 'body') {
      form.set('client_id', config.clientId ?? '');
      form.set('client_secret', config.clientSecret ?? '');
    }

    if (config.includeAccessGroupInToken && config.accessGroup) {
      form.set('access_group', config.accessGroup);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (config.oauthClientAuthMode === 'basic') {
      const basicValue = Buffer.from(
        `${config.clientId}:${config.clientSecret}`,
      ).toString('base64');
      headers.Authorization = `Basic ${basicValue}`;
    }

    const tokenResponse =
      await this.httpClient.request<TravelportTokenResponse>(config.authUrl, {
        method: 'POST',
        headers,
        body: form.toString(),
        timeoutMs: config.requestTimeoutMs,
        responseType: 'json',
      });

    const tokenData = tokenResponse.data;
    if (
      !tokenResponse.ok ||
      !tokenData ||
      typeof tokenData === 'string' ||
      !(
        'access_token' in (tokenData as object) &&
        (tokenData as any).access_token
      )
    ) {
      throw new InternalServerErrorException({
        message: 'Travelport token request failed',
        upstreamStatus: tokenResponse.status,
        upstreamResponse: tokenResponse.data,
      });
    }

    const token = tokenData;
    const ttlSeconds = this.getTokenTtlSeconds(token.expires_in);
    if (ttlSeconds) {
      await this.cacheService.set(cacheKey, token, ttlSeconds);
    }

    return token;
  }

  private extractTravelportResponseErrors(
    data: Record<string, unknown> | undefined,
  ): {
    ok: false;
    message: string;
    sourceCode?: string;
    category?: string;
  } | null {
    if (!data) return null;

    const errorPaths = [
      ['CatalogOfferingsAncillaryListResponse', 'Result', 'Error'],
      ['Result', 'Error'],
    ];

    for (const path of errorPaths) {
      const errors = this.resolvePath(data, path);
      if (!errors) continue;

      const errorArray = Array.isArray(errors) ? errors : [errors];
      for (const err of errorArray) {
        if (err && typeof err === 'object') {
          const errObj = err as Record<string, unknown>;
          const message = this.readString(errObj.Message ?? errObj.message);
          if (message) {
            return {
              ok: false,
              message,
              sourceCode: this.readString(
                errObj.SourceCode ?? errObj.sourceCode,
              ),
              category: this.readString(errObj.category ?? errObj.Category),
            };
          }
        }
      }
    }

    return null;
  }

  private resolvePath(obj: Record<string, unknown>, keys: string[]): unknown {
    let current: unknown = obj;
    for (const key of keys) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  private buildTokenCacheKey(config: TravelportRuntimeConfig): string {
    const accessGroup = config.accessGroup ?? 'default';
    return `travelport:token:${config.clientId}:${config.username}:${accessGroup}`;
  }

  private extractAncillaryPayload(payload: unknown):
    | {
        catalogUuid: string;
        offeringId: string;
        mainProductIds: string[];
        ancillaryProductIds: string[];
        travelerCount: number;
      }
    | undefined {
    if (!payload || typeof payload !== 'object') return undefined;

    const record = payload as Record<string, unknown>;
    const catalogUuid = this.readString(
      record.catalogUuid ?? record.catalogUuidId ?? record.catalogUuidValue,
    );
    const offeringId = this.readString(record.offeringId ?? record.offerId);
    const travelerCount = this.readNumber(
      record.travelerCount ?? record.adults ?? record.passengerCount,
    );

    if (!catalogUuid || !offeringId) return undefined;

    const mainProductIds = this.readStringArray(record.productIds);
    const seatIds = this.readStringArray(record.seatProductIds);
    const baggageIds = this.readStringArray(record.baggageProductIds);
    const ancillaryProductIds = [...new Set([...seatIds, ...baggageIds])];

    if (mainProductIds.length === 0) return undefined;

    return {
      catalogUuid,
      offeringId,
      mainProductIds,
      ancillaryProductIds,
      travelerCount,
    };
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private readNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this.readString(item))
      .filter((item): item is string => Boolean(item));
  }

  private getTokenTtlSeconds(expiresIn?: number): number | undefined {
    if (!expiresIn || !Number.isFinite(expiresIn)) return undefined;
    const ttlSeconds = Math.floor(expiresIn) - 60;
    return ttlSeconds > 0 ? ttlSeconds : undefined;
  }
}
