import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CacheService } from '../../../../shared/cache/cache.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import type { TravelportRuntimeConfig } from '../../../../shared/config/app-config.types';
import { HttpClientService } from '../../../../shared/http/http-client.service';
import type { FlightSearchDto } from '../../api/dto/flight-search.dto';
import type { TravelportBookingWorkflowDto } from '../../api/dto/travelport-booking.dto';
import { ProviderConfigService } from '../../../settings/application/services/provider-config.service';
import { BusinessError } from '../../../../shared/errors/business-error';
import { TravelportPayloadBuilderService } from './travelport-payload-builder.service';
import { SelectedOfferCacheService } from './selected-offer-cache.service';
import { sanitizeForLog } from './flight-log.util';
import {
  TravelportWorkflowRequestBuilderService,
  WorkflowProductSelection,
} from './travelport-workflow-request-builder.service';
import {
  TravelportWorkflowResponseParserService,
  TravelerIdEntry,
} from './travelport-workflow-response-parser.service';

import { TravelportAncillaryService } from './travelport-ancillary.service';
import { TravelportWorkflowHttpService } from './travelport-workflow-http.service';
import type { AncillaryCatalogOption } from '../../domain/entities/ancillary-catalog.types';
import type { NormalizedFlightSearchResponse, SelectedOfferCacheEntry } from '../../domain/entities/flight-search-response';
import { generateExpiredPnr } from '../../../../shared/booking/demo-booking-fallback.util';
import {
  enrichWithLiveFareRules,
  extractFareRulesFromFareRulesResponse,
  extractFareRulesFromPriceResponse,
  type TravelportFarePolicies,
} from '../../infrastructure/providers/travelport/travelport-fare-policy.util';

interface TravelportTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface WorkflowStepResult {
  name: string;
  ok: boolean;
  status: number;
  durationMs: number;
  response: unknown;
  headers: Record<string, string>;
  errors?: unknown[];
  setCookie?: string[];
}

interface WorkflowIdentifiers {
  catalogUuid?: string;
  offeringId?: string;
  productId?: string;
  productIds?: string[];
  seatProductIds?: string[];
  baggageProductIds?: string[];
  priceCurrencyCode?: string;
  priceMinorUnit?: number;
  priceAmount?: number;
  workbenchId?: string;
  reservationId?: string;
  sessionId?: string;
  ticketingWorkbenchId?: string;
  ticketingSessionId?: string;
  sessionFallbackUsed?: boolean;
  repriceSkipped?: boolean;
  offerRef?: string;
  offerIdentifierValue?: string;
  offerIdentifierAuthority?: string;
  fopRef?: string;
  fopIdentifierAuthority?: string;
  fopIdentifierValue?: string;
  paymentIdentifierValue?: string;
  locatorCode?: string;
  ticketNumbers?: string[];
  /** Real supplier ticketing deadline parsed from the commit response. */
  ticketingDeadline?: string;
  ticketingDeadlineSource?: string;
  /** Ticket-by date seen in the price response (fallback when commit lacks one). */
  paymentTimeLimit?: string;
  /** Mapping of travelerIndex to Travelport traveler identifiers */
  travelerIdMapping?: TravelerIdEntry[];
  /** Post-commit ancillary verification results */
  ancillaryVerification?: {
    seatsFound: number;
    seatsRequested: number;
    mealsFound: number;
    mealsRequested: number;
    ancillaryOffersFound: number;
    ancillaryOffersRequested: number;
  };
  /** Seats to add post-commit (Travelport only supports seat add on committed PNR) */
  seatSelections?: Array<{
    seatNumber: string;
    catalogOfferingsIdentifier?: string;
    catalogOfferingIdentifierValue?: string;
    ancillaryProductId?: string;
    travelerRef?: string;
  }>;
  /** Count of ancillary add failures (non-fatal — base PNR was held) */
  ancillaryFailures?: number;
}

@Injectable()
export class TravelportBookingWorkflowService {
  private readonly logger = new Logger(TravelportBookingWorkflowService.name);

  constructor(
    private readonly configService: AppConfigService,
    private readonly httpClient: HttpClientService,
    private readonly cacheService: CacheService,
    private readonly providerConfigService: ProviderConfigService,
    private readonly payloadBuilder: TravelportPayloadBuilderService,
    private readonly selectedOfferCache: SelectedOfferCacheService,
    private readonly ancillaryService: TravelportAncillaryService,
    private readonly requestBuilder: TravelportWorkflowRequestBuilderService,
    private readonly responseParser: TravelportWorkflowResponseParserService,
    private readonly httpHelper: TravelportWorkflowHttpService,
  ) {}

  async runWorkflow(
    input: TravelportBookingWorkflowDto,
    forceNewSearch = false,
  ) {
    const workflowStartTime = Date.now();
    const WORKFLOW_TIMEOUT_MS = 180000;
    const workflowId = randomUUID().slice(0, 8);
    const requestId = input.requestId ?? randomUUID().slice(0, 8);
    const tracePrefix = `[wf=${workflowId} req=${requestId}]`;

    const wf = (msg: string, ...args: unknown[]) => {
      if (process.env.ENABLE_PROVIDER_DEBUG_LOGS !== 'true') return;
      this.logger.log(`${tracePrefix} ${msg}`, ...args);
    };
    const wfWarn = (msg: string, ...args: unknown[]) =>
      this.logger.warn(`${tracePrefix} ${msg}`, ...args);

    const config = await this.httpHelper.resolveConfig(input);
    const token = await this.httpHelper.getAccessToken(config);

    const steps: WorkflowStepResult[] = [];
    const identifiers: WorkflowIdentifiers = {};
    const baseHeaders = this.requestBuilder.buildHeaders(
      config,
      token.access_token,
    );
    const cookieJar = new Map<string, string>();
    const baseUrl = `${config.baseUrl}/${config.acceptVersion}/air`;
    const bookingHeaders = { ...baseHeaders };
    const selectedOfferIds = forceNewSearch
      ? undefined
      : this.requestBuilder.resolveSelectedOfferIds(input);
    let searchIds:
      | {
          catalogUuid?: string;
          offeringId?: string;
          productId?: string;
          productIds?: string[];
          productSelections?: WorkflowProductSelection[];
          currencyCode?: string;
          minorUnit?: number;
          totalPrice?: number;
        }
      | undefined = selectedOfferIds;

    const checkWorkflowTimeout = (stepName: string) => {
      const elapsed = Date.now() - workflowStartTime;
      if (elapsed > WORKFLOW_TIMEOUT_MS) {
        throw new BusinessError(
          'FLIGHTS_BOOKING_TIMEOUT',
          `Booking workflow timed out after ${elapsed}ms at step: ${stepName}. Please retry booking.`,
        );
      }
      return elapsed;
    };

    if (!searchIds) {
      wf('=== SEARCH ===');
      wf('Search URL: %s', `${baseUrl}/catalog/search/catalogproductofferings`);
      const searchStep = await this.httpHelper.requestStep(
        'search',
        `${baseUrl}/catalog/search/catalogproductofferings`,
        {
          method: 'POST',
          headers: baseHeaders,
          body: JSON.stringify(
            this.requestBuilder.buildSearchBody(input, config),
          ),
          responseType: 'json',
        },
      );
      steps.push(searchStep);
      this.httpHelper.applySetCookies(
        bookingHeaders,
        cookieJar,
        searchStep.setCookie,
      );

      wf(
        'Search status=%s ok=%s duration=%sms',
        searchStep.status,
        searchStep.ok,
        searchStep.durationMs,
      );

      if (!searchStep.ok) {
        wfWarn('Search FAILED: step=%s errors=%j', 'search', searchStep.errors);
        return { ok: false, failedStep: 'search', steps, identifiers };
      }

      searchIds = this.responseParser.extractSearchIdentifiers(
        searchStep.response,
        {
          offeringId: input.offeringId,
          productId: input.productId,
        },
      );
      wf('Search extracted IDs: %j', sanitizeForLog(searchIds));
    }

    const effectiveProductIds = searchIds.productIds?.length
      ? searchIds.productIds
      : searchIds.productId
        ? [searchIds.productId]
        : [];
    const effectiveProductSelections = searchIds.productSelections?.length
      ? searchIds.productSelections
      : searchIds.offeringId && effectiveProductIds.length
        ? [
            {
              offeringId: searchIds.offeringId,
              productIds: effectiveProductIds,
            },
          ]
        : [];
    const travelerCount = this.requestBuilder.normalizeTravelers(input).length;
    const selectedSeatProductIds = this.requestBuilder.normalizeIds(
      input.seatProductIds,
    );
    const selectedBaggageProductIds = this.requestBuilder.normalizeIds(
      input.baggageProductIds,
    );
    const unifiedAncillaries = input.ancillaries;

    if (!unifiedAncillaries) {
      wfWarn(
        'ancillaries is null/undefined — legacy callers still pass seatProductIds/baggageProductIds directly. The flight-booking-public.service normalizes these to unified ancillaries.',
      );
    }

    identifiers.catalogUuid = searchIds.catalogUuid;
    identifiers.offeringId =
      searchIds.offeringId ??
      effectiveProductSelections
        .map((selection) => selection.offeringId)
        .join('+');
    identifiers.productId = effectiveProductIds[0];
    identifiers.productIds = effectiveProductIds.length
      ? effectiveProductIds
      : undefined;
    identifiers.seatProductIds = selectedSeatProductIds.length
      ? selectedSeatProductIds
      : undefined;
    identifiers.baggageProductIds = selectedBaggageProductIds.length
      ? selectedBaggageProductIds
      : undefined;

    if (!searchIds.catalogUuid) {
      return {
        ok: false,
        failedStep: 'search-parse',
        steps,
        identifiers,
        message:
          'Missing catalog/offering/product identifiers from search response.',
      };
    }

    // Price step
    wf('=== PRICE ===');
    checkWorkflowTimeout('price');

    let priceResponse: unknown;
    let priceOk = false;
    let priceErrors: unknown[] | undefined;

    const searchKey = input.searchKey?.trim();
    const normalizedOfferId =
      input.offerId?.trim() ??
      identifiers.offeringId ??
      input.offeringId?.trim();
    let cachedEntry: SelectedOfferCacheEntry | null =
      searchKey && normalizedOfferId
        ? await this.selectedOfferCache.retrieve(searchKey, normalizedOfferId)
        : null;
    let cacheSource = cachedEntry ? 'redis' : 'none';

    // When the selected-offer cache misses, try to rebuild it from the
    // search cache before falling through to the durable snapshot.
    if (!cachedEntry && searchKey && normalizedOfferId) {
      wfWarn(
        'Selected-offer cache MISS — attempting rebuild from search cache',
      );
      cachedEntry =
        await this.ancillaryService.buildCacheFromSearchIfMissing(
          searchKey,
          normalizedOfferId,
          this.requestBuilder.normalizeTravelers(input).length,
        );
      if (cachedEntry) {
        cacheSource = 'search_cache';
        wf('Rebuilt selected-offer cache from search cache');
      }
    }

    // Full snapshot fallback — use the durable booking snapshot persisted
    // in the booking row BEFORE building a minimal cache entry. The minimal
    // entry has an empty referenceList (products: {}, flights: {}) which
    // poisons GDS buildfromproducts with stale/expired flight errors.
    //
    // Guard: the snapshot must belong to THIS request's catalog transaction.
    // A snapshot from a different catalogUuid means a previous, unrelated
    // search/booking attempt left this data on the input — using it sends
    // Travelport flight/fare data tied to a dead catalog offering, which it
    // legitimately rejects at add-offer as "stale" (root cause of the
    // one-way "fare error" / multi-city "booking error" reports — the
    // snapshot's catalogUuid didn't match the fresh search's catalogUuid).
    if (!cachedEntry && input.selectedOfferContext) {
      const snapshotCatalogUuid = (
        input.selectedOfferContext as unknown as { catalogUuid?: string }
      )?.catalogUuid;
      const catalogUuidMatches =
        !input.catalogUuid || snapshotCatalogUuid === input.catalogUuid;

      if (!catalogUuidMatches) {
        wfWarn(
          `Durable booking snapshot REJECTED — catalogUuid mismatch (snapshot=${snapshotCatalogUuid?.slice(0, 12)}... current=${input.catalogUuid?.slice(0, 12)}...). Snapshot belongs to a different search; falling through instead of using stale data.`,
        );
      } else {
        cacheSource = 'booking_snapshot';
        wfWarn(
          'All cache layers miss — using durable booking snapshot (selectedOfferContext)',
        );
        cachedEntry = input.selectedOfferContext as unknown as SelectedOfferCacheEntry;
        if (searchKey && normalizedOfferId) {
          await this.selectedOfferCache.store('travelport',
            searchKey,
            normalizedOfferId,
            cachedEntry,
            1800,
          );
        }
      }
    }

    // Last resort: build a minimal cache entry from persisted booking input.
    // WARNING: Minimal entries lack referenceList data — GDS buildfromproducts
    // will likely fail with "FLIGHT DOES NOT EXIST" or "FLIGHTS_OFFER_EXPIRED".
    // This path only fires when the durable snapshot is also null.
    if (!cachedEntry && normalizedOfferId && input.catalogUuid) {
      cacheSource = 'minimal';
      wfWarn('All cache and snapshot miss — building minimal cache entry from booking input');
      const productSelections = input.productSelections?.length
        ? input.productSelections.map((s) => ({ offeringId: s.offeringId, productIds: s.productIds }))
        : input.offeringId
          ? [{ offeringId: input.offeringId, productIds: input.productIds ?? [] }]
          : [];
      const travelerCount = this.requestBuilder.normalizeTravelers(input).length || 1;
      const minimalEntry: SelectedOfferCacheEntry = {
        catalogUuid: input.catalogUuid,
        offeringIds: productSelections.map((s) => s.offeringId),
        productRefs: productSelections.flatMap((s) => s.productIds),
        productSelections,
        contentSource: 'GDS',
        workflowKind: 'gds',
        capabilities: {
          seatMapAvailable: true,
          ancillaryShopAvailable: false,
          mealSsrSupported: true,
          postBookingManageAvailable: false,
        },
        passengerCriteria: [{ number: travelerCount, passengerTypeCode: 'ADT' }],
        referenceList: { products: {}, flights: {} },
        travelportPlusSessionId: (input as any)?.travelportPlusSessionId,
        searchCriteria: {
          from: input.from ?? '',
          to: input.to ?? '',
          departureDate: input.departureDate ?? '',
          adults: travelerCount,
        },
      };
      if (searchKey) {
        await this.selectedOfferCache.store('travelport', searchKey, normalizedOfferId, minimalEntry);
      }
      cachedEntry = minimalEntry;
    }

    // Validate referenceList for GDS entries — buildfromproducts requires
    // valid product/flight references. If the current entry lacks them and
    // a durable snapshot exists, upgrade in-place.
    const hasReferenceList = !!(
      cachedEntry?.referenceList?.products &&
      Object.keys(cachedEntry.referenceList.products).length > 0 &&
      cachedEntry?.referenceList?.flights &&
      Object.keys(cachedEntry.referenceList.flights).length > 0
    );

    if (cachedEntry && cachedEntry.contentSource === 'GDS' && !hasReferenceList) {
      if (input.selectedOfferContext) {
        wfWarn('GDS entry missing referenceList — upgrading with durable booking snapshot');
        cachedEntry = input.selectedOfferContext as unknown as SelectedOfferCacheEntry;
        cacheSource = 'booking_snapshot (upgraded)';
        if (searchKey && normalizedOfferId) {
          await this.selectedOfferCache.store('travelport', searchKey, normalizedOfferId, cachedEntry, 1800);
        }
      } else {
        wfWarn('GDS entry missing referenceList and no snapshot available — buildfromproducts will likely fail');
      }
    }

    if (cachedEntry) {
      wf(
        'Cache source=%s offerId=%s catalogUuid=%s refs products=%s flights=%s contentSource=%s',
        cacheSource,
        normalizedOfferId,
        cachedEntry.catalogUuid?.slice(0, 16) ?? '(none)',
        Object.keys(cachedEntry.referenceList?.products ?? {}).length,
        Object.keys(cachedEntry.referenceList?.flights ?? {}).length,
        cachedEntry.contentSource ?? 'unset',
      );
      const isNdc = cachedEntry.contentSource === 'NDC';
      const isMultiCityGds = !isNdc &&
        (cachedEntry.productSelections?.length >= 2 &&
         cachedEntry.productSelections[0]?.offeringId !== cachedEntry.productSelections[1]?.offeringId);
      const useCatalogPayload = isNdc || isMultiCityGds || !hasReferenceList;
      wfWarn(
        `[MULTI-CITY-WF] price: isNdc=${isNdc} isMultiCityGds=${isMultiCityGds} useCatalogPayload=${useCatalogPayload} selections=${cachedEntry.productSelections?.length ?? 0}`,
      );

      // GDS with expired cache → no session header → Travelport can't validate the catalog.
      // Hold locally instead of failing the booking. Manual supplier processing required.
      if (useCatalogPayload && !hasReferenceList && cachedEntry.contentSource === 'GDS' && !cachedEntry.travelportPlusSessionId) {
        wfWarn('GDS booking with expired cache and no session header — holding locally');
        // Random EXP-tagged fake PNR (not the old non-random "IKF<id>") — makes
        // it unambiguous everywhere the reference is shown that this offer
        // expired before Travelport ever confirmed it.
        const localRef = generateExpiredPnr('travelport');
        return {
          ok: true,
          failedStep: undefined,
          steps,
          identifiers: {
            catalogUuid: cachedEntry.catalogUuid,
            offeringId: cachedEntry.offeringIds?.[0],
            productIds: cachedEntry.productRefs,
            locatorCode: localRef,
          },
          message: 'Booking held locally — cache expired. Manual supplier processing required.',
        };
      }

      try {
        let pricePayload: unknown;
        let priceUrl: string;

        if (useCatalogPayload) {
          // NDC or multi-city GDS: Use reference-based payload
          wf(
            '%s reprice: catalogUuid=%s productSelections=%d',
            isMultiCityGds ? 'Multi-city GDS' : 'NDC',
            cachedEntry.catalogUuid?.slice(0, 20),
            cachedEntry.productSelections?.length ?? 0,
          );
          priceUrl = `${baseUrl}/price/offers/buildfromcatalogproductofferings`;
          pricePayload = this.requestBuilder.buildOfferBody(
            cachedEntry.catalogUuid,
            cachedEntry.productSelections,
          );
          wf('Price using buildfromcatalogproductofferings (Reference Path)');
        } else {
          // GDS: Use full payload (specific flight criteria)
          priceUrl = `${baseUrl}/price/offers/buildfromproducts`;
          pricePayload = this.payloadBuilder.buildFromProducts(cachedEntry);
          wf('Price using buildfromproducts (Full Payload Path)');
        }
        wf('Price URL: %s', priceUrl);

        // ponytail: inject search session ID for multi-city GDS — required for
        // BuildFromCatalogProductOfferings to validate against the search session.
        if (isMultiCityGds && cachedEntry.travelportPlusSessionId) {
          bookingHeaders.travelportPlusSessionIdentifier = cachedEntry.travelportPlusSessionId;
          wfWarn(`[MULTI-CITY-WF] Session header injected: ${cachedEntry.travelportPlusSessionId.slice(0, 20)}...`);
        } else {
          wfWarn(`[MULTI-CITY-WF] NO session header — isMultiCityGds=${isMultiCityGds} hasSessionId=${!!cachedEntry.travelportPlusSessionId}`);
        }

        const priceStep = await this.httpHelper.requestStep('price', priceUrl, {
          method: 'POST',
          headers: bookingHeaders,
          body: JSON.stringify(pricePayload),
          responseType: 'json',
        });
        steps.push(priceStep);
        this.httpHelper.applySetCookies(
          bookingHeaders,
          cookieJar,
          priceStep.setCookie,
        );

        wf(
          'Price status=%s ok=%s duration=%sms',
          priceStep.status,
          priceStep.ok,
          priceStep.durationMs,
        );

        if (process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true') {
          const rawBody =
            typeof priceStep.response === 'object'
              ? JSON.stringify(priceStep.response)
              : String(priceStep.response ?? '');
          const rawLen = rawBody.length;
          this.logger.log(
            `[TRAVELPORT] Raw reprice response (${rawLen} chars): ${
              rawLen > 50000
                ? rawBody.slice(0, 50000) + `\n... [TRUNCATED, total ${rawLen} chars]`
                : rawBody
            }`,
          );
        }

        priceOk = priceStep.ok;
        priceResponse = priceStep.response;
        priceErrors = priceStep.errors;

        // For GDS, no retry with buildfromcatalogproductofferings —
        // the full-payload path must succeed or fail as-is. NDC has its
        // own path above and never reaches this retry logic.

        if (!priceOk) {
          const errorsStr = JSON.stringify(priceErrors ?? '');
          const isFareAvailabilityError =
            errorsStr.includes('FLIGHT SEGMENTS UNAVAILABLE') ||
            errorsStr.includes('UNAVAILABLE IN THE REQUESTED CLASS') ||
            errorsStr.includes('CLASS OF SERVICE') ||
            errorsStr.includes('NO AVAILABLE FARES') ||
            errorsStr.includes('REQUESTED CABIN HAS NO AVAILABLE FARES') ||
            errorsStr.includes('FARE IS NOT AVAILABLE') ||
            errorsStr.includes('NO LONGER AVAILABLE');

          if (isFareAvailabilityError) {
            wfWarn(
              'Fare availability error detected — blocking booking, not falling back to cache',
            );
            return {
              ok: false,
              failedStep: 'price',
              steps,
              identifiers,
              message:
                'FLIGHTS_OFFER_UNAVAILABLE: The selected fare/class is no longer available. Please search again.',
            };
          }

          wfWarn('Price FAILED — contentSource=%s', isNdc ? 'NDC' : 'GDS');
          return {
            ok: false,
            failedStep: 'price',
            steps,
            identifiers,
            message: 'Pricing failed. The cached offer may be stale.',
          };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('FLIGHTS_PAYLOAD_BUILD_FAILED')) {
          wfWarn('Payload build failed: %s', message);
          return {
            ok: false,
            failedStep: 'payload-build',
            steps,
            identifiers,
            message,
          };
        }
        wfWarn('Price FAILED: %s', message);
        return {
          ok: false,
          failedStep: 'price',
          steps,
          identifiers,
          message: `Pricing failed: ${message}`,
        };
      }
    } else {
      // No cached entry and all rebuild attempts failed — offer has expired
      wfWarn(
        'Selected-offer cache MISS for searchKey=%s offeringId=%s — all rebuild attempts failed | catalogUuid=%s productSelectionsLen=%d searchKeyLen=%d offerIdLen=%d',
        searchKey,
        normalizedOfferId,
        input.catalogUuid ? (input.catalogUuid as string).slice(0, 16) + '...' : '(none)',
        input.productSelections?.length ?? 0,
        searchKey?.length ?? 0,
        normalizedOfferId?.length ?? 0,
      );
      return {
        ok: false,
        failedStep: 'price',
        steps,
        identifiers,
        message:
          'FLIGHTS_OFFER_EXPIRED: The selected offer is no longer available. Please perform a new search and select a current offer.',
      };
    }

    if (!priceOk) {
      wfWarn('Price FAILED');
      return { ok: false, failedStep: 'price', steps, identifiers };
    }

    const priceDetails = this.responseParser.extractPriceDetails(priceResponse);
    identifiers.priceCurrencyCode =
      priceDetails.currencyCode ?? identifiers.priceCurrencyCode;
    identifiers.priceMinorUnit =
      priceDetails.minorUnit ?? identifiers.priceMinorUnit;
    identifiers.priceAmount =
      priceDetails.totalPrice ?? identifiers.priceAmount;
    // Ticket-by date is present at price time (next to ValidatingAirline)
    // even when the commit response omits it — keep as deadline fallback.
    identifiers.paymentTimeLimit =
      this.responseParser.extractPaymentTimeLimit(priceResponse) ??
      identifiers.paymentTimeLimit;

    wf(
      'Price result: currency=%s amount=%s',
      identifiers.priceCurrencyCode,
      identifiers.priceAmount,
    );

    // Workbench create
    wf('=== WORKBENCH CREATE ===');
    checkWorkflowTimeout('workbench-create');
    const workbenchStep = await this.httpHelper.requestStep(
      'workbench-create',
      `${baseUrl}/book/session/reservationworkbench`,
      {
        method: 'POST',
        headers: bookingHeaders,
        body: JSON.stringify({ '@type': 'ReservationID' }),
        responseType: 'json',
      },
    );
    steps.push(workbenchStep);
    this.httpHelper.applySetCookies(
      bookingHeaders,
      cookieJar,
      workbenchStep.setCookie,
    );

    wf(
      'Workbench create status=%s ok=%s duration=%sms',
      workbenchStep.status,
      workbenchStep.ok,
      workbenchStep.durationMs,
    );

    if (!workbenchStep.ok) {
      wfWarn('Workbench create FAILED');
      return { ok: false, failedStep: 'workbench', steps, identifiers };
    }

    const workbenchIds = this.responseParser.extractWorkbenchIdentifiers(
      workbenchStep.response,
      workbenchStep.headers,
    );
    identifiers.workbenchId = workbenchIds.workbenchId;
    identifiers.reservationId = workbenchIds.workbenchId;
    const sessionId = workbenchIds.sessionId;
    identifiers.sessionId = sessionId;
    identifiers.sessionFallbackUsed = false;

    wf(
      'Workbench created: id=%s sessionId=%s',
      workbenchIds.workbenchId,
      sessionId,
    );

    if (!workbenchIds.workbenchId) {
      wfWarn('MISSING workbenchId in response');
      return {
        ok: false,
        failedStep: 'workbench-parse',
        steps,
        identifiers,
        message: 'Missing workbench identifier.',
      };
    }

    const sessionHeaders = this.requestBuilder.buildSessionHeaders(
      bookingHeaders,
      sessionId,
    );

    const travelers = this.requestBuilder.normalizeTravelers(input);
    wf('Traveler count: %d', travelers.length);
    identifiers.travelerIdMapping = [];
    for (let index = 0; index < travelers.length; index += 1) {
      const travelerBody = this.requestBuilder.buildTravelerBody(
        travelers[index],
        index,
      );
      wf(
        'Traveler %d body (sanitized): %j',
        index + 1,
        sanitizeForLog(travelerBody),
      );
      const travelerStep = await this.httpHelper.requestStep(
        `add-traveler-${index + 1}`,
        `${baseUrl}/book/traveler/reservationworkbench/${workbenchIds.workbenchId}/travelers`,
        {
          method: 'POST',
          headers: sessionHeaders,
          body: JSON.stringify(travelerBody),
          responseType: 'json',
        },
      );
      steps.push(travelerStep);
      this.httpHelper.applySetCookies(
        sessionHeaders,
        cookieJar,
        travelerStep.setCookie,
      );

      if (!travelerStep.ok) {
        return {
          ok: false,
          failedStep: travelerStep.name,
          steps,
          identifiers,
        };
      }

      // Capture Travelport traveler identifiers from response
      wfWarn('Traveler %d response keys: top=[%s] inner=%j', index + 1,
        Object.keys(travelerStep.response as Record<string, unknown> ?? {}).join(', '),
        Object.keys(((travelerStep.response as Record<string, unknown>)?.TravelerResponse as Record<string, unknown>) ?? {}).join(', '));
      const travelerEntry: TravelerIdEntry = {
        localRef: `travelerRefId_${index + 1}`,
        travelportTravelerId: this.responseParser.extractTravelerId(
          travelerStep.response,
        ),
        travelportTravelerIdentifierValue:
          this.responseParser.extractTravelerIdentifierValue(
            travelerStep.response,
          ),
      };
      identifiers.travelerIdMapping.push(travelerEntry);
      wf(
        'Traveler %d mapping: localRef=%s travelportId=%s identifierValue=%s',
        index + 1,
        travelerEntry.localRef,
        travelerEntry.travelportTravelerId,
        travelerEntry.travelportTravelerIdentifierValue,
      );
    }

    // Add-offer step
    wf('=== ADD-OFFER ===');

    let offerResponse: unknown;
    let offerOk = false;

    const offerSearchKey = input.searchKey?.trim();
    const offerNormalizedId =
      identifiers.offeringId ?? input.offeringId?.trim();
    let offerCachedEntry =
      offerSearchKey && offerNormalizedId
        ? await this.selectedOfferCache.retrieve(
            offerSearchKey,
            offerNormalizedId,
          )
        : null;

    // Fallback: rebuild the cache entry from the search cache when the
    // selected-offer cache misses (e.g. user skipped preview, or cache expired)
    if (!offerCachedEntry && offerSearchKey && offerNormalizedId) {
      wf(
        'Selected-offer cache MISS — attempting rebuild from search cache',
      );
      offerCachedEntry =
        await this.ancillaryService.buildCacheFromSearchIfMissing(
          offerSearchKey,
          offerNormalizedId,
        );
      if (offerCachedEntry) {
        wf(
          'Rebuilt selected-offer cache from search cache (contentSource=%s)',
          offerCachedEntry.contentSource,
        );
      } else {
        wfWarn(
          'Could not rebuild selected-offer cache from search cache',
        );
      }
    }

    if (offerCachedEntry) {
      // ponytail: inject search session ID for multi-city GDS booking.
      // Required for BuildFromCatalogProductOfferings to validate against search.
      if (offerCachedEntry.travelportPlusSessionId) {
        sessionHeaders.travelportPlusSessionIdentifier = offerCachedEntry.travelportPlusSessionId;
      }

      const isNdc = offerCachedEntry.contentSource === 'NDC';
      const isMultiCityGdsAddOffer = !isNdc && 
        (offerCachedEntry.productSelections?.length >= 2 &&
         offerCachedEntry.productSelections[0]?.offeringId !== offerCachedEntry.productSelections[1]?.offeringId);
      const useCatalogPayloadAddOffer = isNdc || isMultiCityGdsAddOffer;
      wfWarn(
        `[MULTI-CITY-WF] add-offer: isNdc=${isNdc} isMultiCityGds=${isMultiCityGdsAddOffer} useCatalogPayload=${useCatalogPayloadAddOffer} selections=${offerCachedEntry.productSelections?.length ?? 0}`,
      );
      try {
        let offerPayload: unknown;
        let offerUrl: string;

        if (useCatalogPayloadAddOffer) {
          // NDC or multi-city GDS: Use reference-based payload (catalog product offering identifiers)
          offerUrl = `${baseUrl}/book/airoffer/reservationworkbench/${workbenchIds.workbenchId}/offers/buildfromcatalogproductofferings`;
          offerPayload = this.requestBuilder.buildOfferBody(
            offerCachedEntry.catalogUuid,
            offerCachedEntry.productSelections,
          );
          wf(
            'Add-offer using buildfromcatalogproductofferings (Reference Path)',
          );
        } else {
          // GDS: Use full-payload path exclusively. Reference-based endpoints
          // (buildfromcatalogproductofferings) produce booking-level payloads
          // that Travelport may reject or reprice incorrectly. buildfromproducts
          // is slower (~30s) but produces correct, rateable offers.
          offerUrl = `${baseUrl}/book/airoffer/reservationworkbench/${workbenchIds.workbenchId}/offers/buildfromproducts`;
          offerPayload =
            this.payloadBuilder.buildFromProducts(offerCachedEntry);
          wf('Add-offer using buildfromproducts (Full Payload Path)');
        }
        wf('Offer URL: %s', offerUrl);

        const offerStep = await this.httpHelper.requestStep(
          'add-offer',
          offerUrl,
          {
            method: 'POST',
            headers: sessionHeaders,
            body: JSON.stringify(offerPayload),
            responseType: 'json',
          },
        );
        steps.push(offerStep);
        this.httpHelper.applySetCookies(
          sessionHeaders,
          cookieJar,
          offerStep.setCookie,
        );

        wf(
          'Add-offer status=%s ok=%s duration=%sms',
          offerStep.status,
          offerStep.ok,
          offerStep.durationMs,
        );
        offerOk = offerStep.ok;
        offerResponse = offerStep.response;

        if (!offerOk && !isNdc) {
          // GDS: buildfromproducts may fail with validation errors like
          // "OFFER ID AND PRODUCT ID CANNOT BE DUPLICATE", stale flight
          // errors like "FLIGHT DOES NOT EXIST ON THIS DATE OR TO THE
          // REQUESTED CITY PAIRS", or waitlist errors like
          // "*0 AVAIL/WL OPEN*". Retry with the reference-based endpoint
          // (buildfromcatalogproductofferings) which uses catalogUuid
          // instead of raw flight criteria.
          const addOfferErrors = this.responseParser.extractResultErrors(offerStep.response as Record<string, unknown>);
          const addOfferErrMsg = addOfferErrors.length > 0
            ? String((addOfferErrors[0] as Record<string, unknown>)?.Message ?? '')
            : '';
          const isStaleFlightError =
            addOfferErrMsg.includes('FLIGHT DOES NOT EXIST') ||
            addOfferErrMsg.includes('NO OFFERS FOUND') ||
            // "FLIGHT CAN NOT BE BOARDED AT THIS CITY" (Travelport code 4965):
            // the full-payload (raw SpecificFlightCriteria) path can mis-derive
            // the boarding point for some codeshare/alternate-city flights (e.g.
            // EY 5427 boarding at XNB) even though the flight is genuinely
            // bookable — confirmed by the reference path (buildfromcatalogproductofferings,
            // which books by catalogUuid+offeringId instead of re-specifying
            // flight criteria) succeeding for the exact same flight. Retry there
            // instead of hard-failing the booking.
            addOfferErrMsg.includes('CAN NOT BE BOARDED') ||
            addOfferErrMsg.includes('CANNOT BE BOARDED');
          const isDuplicateOfferError =
            addOfferErrMsg.includes('CANNOT BE DUPLICATE') ||
            addOfferErrMsg.includes('DUPLICATE');
          const isAvailabilityError =
            addOfferErrMsg.includes('AVAIL/WL OPEN') ||
            addOfferErrMsg.includes('AVAIL') ||
            addOfferErrMsg.includes('WL OPEN');

          // Travelport sometimes returns errors alongside valid offer data.
          // Check if the response contains offer identifiers despite the error.
          const offerIdentifiersFromResponse =
            this.responseParser.extractOfferIdentifiers(offerStep.response);
          const hasOfferData =
            !!(
              offerIdentifiersFromResponse.id ||
              offerIdentifiersFromResponse.value ||
              offerIdentifiersFromResponse.offerRef
            );

          // "DUPLICATE" means the offer was already added to the workbench
          // by the buildfromproducts call (Travelport returns 200 + error
          // in this case). Treat as soft success — the offer IS in the
          // workbench, no retry needed.
          //
          // "AVAIL/WL OPEN" means the flight class is on waitlist, but the
          // offer may still be in the workbench. If the response contains
          // offer identifiers, treat as soft success.
          if (isDuplicateOfferError) {
            wfWarn(
              'Add-offer buildfromproducts returned DUPLICATE error — offer already in workbench, treating as success',
            );
            offerOk = true;
            offerResponse = offerStep.response;
          } else if (isAvailabilityError && hasOfferData) {
            wfWarn(
              'Add-offer buildfromproducts returned availability error (%s) but response contains offer data — treating as success (waitlisted)',
              addOfferErrMsg,
            );
            offerOk = true;
            offerResponse = offerStep.response;
          } else if (isStaleFlightError && offerCachedEntry?.catalogUuid) {
            wfWarn(
              'Add-offer buildfromproducts returned stale-flight error (%s) - retrying reference path',
              addOfferErrMsg,
            );
            const retryOfferUrl = `${baseUrl}/book/airoffer/reservationworkbench/${workbenchIds.workbenchId}/offers/buildfromcatalogproductofferings`;
            const retryOfferPayload = this.requestBuilder.buildOfferBody(
              offerCachedEntry.catalogUuid,
              offerCachedEntry.productSelections,
            );
            const retryOfferStep = await this.httpHelper.requestStep(
              'add-offer-reference-retry',
              retryOfferUrl,
              {
                method: 'POST',
                headers: sessionHeaders,
                body: JSON.stringify(retryOfferPayload),
                responseType: 'json',
              },
            );
            steps.push(retryOfferStep);
            this.httpHelper.applySetCookies(
              sessionHeaders,
              cookieJar,
              retryOfferStep.setCookie,
            );
            wf(
              'Add-offer reference retry status=%s ok=%s duration=%sms',
              retryOfferStep.status,
              retryOfferStep.ok,
              retryOfferStep.durationMs,
            );
            offerOk = retryOfferStep.ok;
            offerResponse = retryOfferStep.response;
            if (!offerOk) {
              wfWarn(
                'Add-offer reference retry FAILED - errors=%j',
                retryOfferStep.errors,
              );
            }
          } else {
            wfWarn(
              'Add-offer buildfromproducts rejected (%s). No safe fallback condition matched.',
              addOfferErrMsg,
            );
          }
        }

        if (!offerOk) {
          wfWarn(
            'Add-offer FAILED — contentSource=%s errors=%j',
            isNdc ? 'NDC' : 'GDS',
            offerStep.errors,
          );
          return {
            ok: false,
            failedStep: 'add-offer',
            steps,
            identifiers,
            message: 'Add-offer failed. The cached offer may be stale.',
          };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('FLIGHTS_PAYLOAD_BUILD_FAILED')) {
          wfWarn('Payload build failed: %s', message);
          return {
            ok: false,
            failedStep: 'payload-build',
            steps,
            identifiers,
            message,
          };
        }
        wfWarn('Add-offer FAILED: %s', message);
        return {
          ok: false,
          failedStep: 'add-offer',
          steps,
          identifiers,
          message: `Add-offer failed: ${message}`,
        };
      }
    } else {
      // No cached entry — offer has expired
      wfWarn(
        'Selected-offer cache MISS for add-offer (searchKey=%s offeringId=%s)',
        offerSearchKey,
        offerNormalizedId,
      );
      return {
        ok: false,
        failedStep: 'add-offer',
        steps,
        identifiers,
        message:
          'FLIGHTS_OFFER_EXPIRED: The selected offer is no longer available for add-offer. Please perform a new search.',
      };
    }

    if (!offerOk) {
      return { ok: false, failedStep: 'add-offer', steps, identifiers };
    }

    const offerIdentifiers =
      this.responseParser.extractOfferIdentifiers(offerResponse);
    identifiers.offerRef = offerIdentifiers.offerRef ?? offerIdentifiers.id;
    identifiers.offerIdentifierValue = offerIdentifiers.value;
    identifiers.offerIdentifierAuthority = offerIdentifiers.authority;

    // ── Phase 6: Re-shop ancillaries from the workbench ──
    // After the main offer is added, re-shop seat availability and ancillary
    // services to get fresh identifiers from the committed workbench context.
    // Falls back to original selections if re-shop fails.

    const seatsToAdd = unifiedAncillaries?.seats ?? [];
    const baggageToAdd = unifiedAncillaries?.baggage ?? [];
    const servicesToAdd = unifiedAncillaries?.services ?? [];

    let freshSeatOptions: AncillaryCatalogOption[] = [];

    // Seat re-shop: for GDS, uses BuildFromProducts (no workbench/catalogUuid needed).
    // For NDC, uses buildSeatAvailabilityBodyForNdc with catalogUuid.
    // Fresh options get booking-scoped identifiers, avoiding 8527 on seat add.
    if (seatsToAdd.length > 0 && offerCachedEntry) {
      const cs = (offerCachedEntry.contentSource as 'NDC' | 'GDS') ?? 'GDS';
      wf('=== RE-SHOP SEATS (cs=%s) ===', cs);
      try {
        freshSeatOptions = await this.ancillaryService.reshopSeatsInWorkbench(
          searchIds.catalogUuid ?? '',
          offerCachedEntry.productSelections,
          cs,
          offerCachedEntry,
          workbenchIds.workbenchId,
          sessionId,
        );
        wfWarn('Re-shop seats: got %d fresh options', freshSeatOptions.length);
        if (freshSeatOptions.length > 0) {
          const sampleAssignments = freshSeatOptions.slice(0, 5).map((o) => o.supplier?.seatAssignment ?? '(none)');
          wfWarn('Fresh seat samples: %j, uniqueSeats=%d', sampleAssignments, new Set(freshSeatOptions.map((o) => o.supplier?.seatAssignment)).size);
        }
      } catch (err: unknown) {
        wfWarn('Seat re-shop failed: %s', err instanceof Error ? err.message : String(err));
      }
    }

    // Remap seats (no-op when freshSeatOptions is empty)
    // Fresh options get booking-scoped identifiers. Unmatched seats fall
    // back to original catalog identifiers and are tried anyway (8527 errors
    // for stale identifiers are non-fatal).
    const { remapped: remappedSeats, unmatched: unmatchedSeats } =
      this.responseParser.remapSeatsFromFreshOptions(
        seatsToAdd,
        freshSeatOptions,
      );

    if (unmatchedSeats.length > 0) {
      const selSummary = seatsToAdd.map((s) => ({ seat: s.seatNumber, seg: s.segmentRef?.slice(0, 8) }));
      wfWarn(
        'Unmatched seats — trying with original identifiers: %s; selections=%j',
        unmatchedSeats.join(', '),
        selSummary,
      );
      // Add back unmatched seats with their original identifiers as fallback
      for (const seat of seatsToAdd) {
        if (unmatchedSeats.includes(seat.seatNumber)) {
          remappedSeats.push(seat);
        }
      }
    }

    // ── Add ancillaries ──
    // Seats moved to post-commit (Travelport only allows seat add after commit).
    // The seat re-shop above gets fresh identifiers; actual seat add happens
    // in the PostBookingExtras service or post-commit flow.

    // Save remapped seats for post-commit / post-booking use
    identifiers.seatSelections = remappedSeats;
    wfWarn('Seats held for post-commit: %d seats saved (add happens after PNR commit)', remappedSeats.length);

    // Step B: Add Meal SSRs (specialservices/list endpoint)
    const mealsToAdd = unifiedAncillaries?.meals ?? [];
    if (mealsToAdd.length > 0 && identifiers.offerIdentifierValue) {
      // Resolve traveler refs to booking workbench IDs (same as seat flow)
      const resolvedMeals = mealsToAdd.map((m) => ({
        ...m,
        travelerRef: this.responseParser.resolveTravelerRef(
          m.travelerRef,
          identifiers.travelerIdMapping,
        ),
      }));
      wf('=== ADD-MEALS ===');
      const mealAddBody = this.requestBuilder.buildMealSsrBody(
        identifiers.offerIdentifierValue,
        resolvedMeals,
        workbenchIds.workbenchId,
      );
      const mealStep = await this.httpHelper.requestStep(
        'add-meals',
        `${baseUrl}/book/specialservices/reservationworkbench/${workbenchIds.workbenchId}/specialservices/list`,
        {
          method: 'POST',
          headers: sessionHeaders,
          body: JSON.stringify(mealAddBody),
          responseType: 'json',
        },
      );
      steps.push(mealStep);
      this.httpHelper.applySetCookies(
        sessionHeaders,
        cookieJar,
        mealStep.setCookie,
      );
      wf(
        'Meals status=%s ok=%s duration=%sms',
        mealStep.status,
        mealStep.ok,
        mealStep.durationMs,
      );
      if (!mealStep.ok) {
        wfWarn('Meal step FAILED (status=%s) — non-fatal, continuing; body=%j', mealStep.status, mealStep.response);
        // Phase 6: Meal SSR failure is non-fatal — flight booking can still succeed
        identifiers.offerIdentifierValue = identifiers.offerIdentifierValue;
      } else {
        wf('Meals added OK');
      }
    } else {
      wf('No meals to add');
    }

    // Commit booking — with single retry on fare availability errors.
    // Travelport can return "FARE IS NOT AVAILABLE" at commit time when the
    // fare class expires between pricing and commit (~20s gap). A fresh
    // reprice + re-add-offer + re-commit often recovers from this.
    const COMMIT_MAX_RETRIES = 1;
    let commitBookingStep: WorkflowStepResult | undefined;
    let tentativeLocator: string | undefined;

    for (let commitAttempt = 0; commitAttempt <= COMMIT_MAX_RETRIES; commitAttempt++) {
      if (commitAttempt > 0) {
        wf('=== COMMIT RETRY %d/%d — fresh reprice + re-add-offer ===', commitAttempt, COMMIT_MAX_RETRIES);

        // Step 1: Fresh reprice
        if (offerCachedEntry) {
          const retryIsNdc = offerCachedEntry.contentSource === 'NDC';
          try {
            let retryPricePayload: unknown;
            let retryPriceUrl: string;

            if (retryIsNdc) {
              retryPriceUrl = `${baseUrl}/price/offers/buildfromcatalogproductofferings`;
              retryPricePayload = this.requestBuilder.buildOfferBody(
                offerCachedEntry.catalogUuid,
                offerCachedEntry.productSelections,
              );
            } else {
              // GDS: always use full-payload buildfromproducts even on retry.
              // Reference-based payloads produce misfit offers that Travelport
              // rejects or reprice at different rates.
              retryPriceUrl = `${baseUrl}/price/offers/buildfromproducts`;
              retryPricePayload = this.payloadBuilder.buildFromProducts(offerCachedEntry);
            }

            const retryPriceStep = await this.httpHelper.requestStep(
              'commit-retry-price',
              retryPriceUrl,
              {
                method: 'POST',
                headers: bookingHeaders,
                body: JSON.stringify(retryPricePayload),
                responseType: 'json',
              },
            );
            steps.push(retryPriceStep);
            this.httpHelper.applySetCookies(
              bookingHeaders,
              cookieJar,
              retryPriceStep.setCookie,
            );

            wf(
              'Commit retry price status=%s ok=%s duration=%sms',
              retryPriceStep.status,
              retryPriceStep.ok,
              retryPriceStep.durationMs,
            );

            if (retryPriceStep.ok) {
              const retryPriceDetails = this.responseParser.extractPriceDetails(
                retryPriceStep.response,
              );
              identifiers.priceCurrencyCode =
                retryPriceDetails.currencyCode ?? identifiers.priceCurrencyCode;
              identifiers.priceMinorUnit =
                retryPriceDetails.minorUnit ?? identifiers.priceMinorUnit;
              identifiers.priceAmount =
                retryPriceDetails.totalPrice ?? identifiers.priceAmount;
              wf(
                'Commit retry price: currency=%s amount=%s',
                identifiers.priceCurrencyCode,
                identifiers.priceAmount,
              );
            } else {
              wfWarn('Commit retry price FAILED — proceeding with existing price');
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            wfWarn('Commit retry price threw: %s — proceeding with existing price', msg);
          }
        }

        // Step 2: Create a FRESH workbench — the previous commit invalidated it
        wf('=== COMMIT RETRY: Creating fresh workbench ===');
        const retryWorkbenchStep = await this.httpHelper.requestStep(
          'retry-workbench-create',
          `${baseUrl}/book/session/reservationworkbench`,
          {
            method: 'POST',
            headers: bookingHeaders,
            body: JSON.stringify({ '@type': 'ReservationID' }),
            responseType: 'json',
          },
        );
        steps.push(retryWorkbenchStep);
        this.httpHelper.applySetCookies(
          bookingHeaders,
          cookieJar,
          retryWorkbenchStep.setCookie,
        );
        wf(
          'Retry workbench create status=%s ok=%s duration=%sms',
          retryWorkbenchStep.status,
          retryWorkbenchStep.ok,
          retryWorkbenchStep.durationMs,
        );

        if (!retryWorkbenchStep.ok) {
          wfWarn('Retry workbench create FAILED — will attempt commit with stale workbench');
        } else {
          const retryWorkbenchIds = this.responseParser.extractWorkbenchIdentifiers(
            retryWorkbenchStep.response,
            retryWorkbenchStep.headers,
          );
          if (retryWorkbenchIds.workbenchId) {
            workbenchIds.workbenchId = retryWorkbenchIds.workbenchId;
            identifiers.workbenchId = retryWorkbenchIds.workbenchId;
            identifiers.reservationId = retryWorkbenchIds.workbenchId;
            if (retryWorkbenchIds.sessionId) {
              identifiers.sessionId = retryWorkbenchIds.sessionId;
            }
            const retrySessionHeaders = this.requestBuilder.buildSessionHeaders(
              bookingHeaders,
              retryWorkbenchIds.sessionId,
            );
            // Overwrite sessionHeaders in outer scope for subsequent steps
            Object.assign(sessionHeaders, retrySessionHeaders);
            wf('Retry workbench created: id=%s', retryWorkbenchIds.workbenchId);

            // Step 2b: Re-add travelers to the fresh workbench
            if (input) {
              const retryTravelers = this.requestBuilder.normalizeTravelers(input);
              identifiers.travelerIdMapping = [];
              for (let ti = 0; ti < retryTravelers.length; ti += 1) {
                const retryTravelerBody = this.requestBuilder.buildTravelerBody(
                  retryTravelers[ti],
                  ti,
                );
                const retryTravelerStep = await this.httpHelper.requestStep(
                  `retry-add-traveler-${ti + 1}`,
                  `${baseUrl}/book/traveler/reservationworkbench/${retryWorkbenchIds.workbenchId}/travelers`,
                  {
                    method: 'POST',
                    headers: sessionHeaders,
                    body: JSON.stringify(retryTravelerBody),
                    responseType: 'json',
                  },
                );
                steps.push(retryTravelerStep);
                this.httpHelper.applySetCookies(
                  sessionHeaders,
                  cookieJar,
                  retryTravelerStep.setCookie,
                );
                const retryTravelerEntry: TravelerIdEntry = {
                  localRef: `travelerRefId_${ti + 1}`,
                  travelportTravelerId: this.responseParser.extractTravelerId(
                    retryTravelerStep.response,
                  ),
                  travelportTravelerIdentifierValue:
                    this.responseParser.extractTravelerIdentifierValue(
                      retryTravelerStep.response,
                    ),
                };
                identifiers.travelerIdMapping.push(retryTravelerEntry);
                wf(
                  'Retry traveler %d: status=%s id=%s',
                  ti + 1,
                  retryTravelerStep.ok,
                  retryTravelerEntry.travelportTravelerId,
                );
              }
            }
          }
        }

        // Step 3: Re-add offer to get fresh identifiers
        if (offerCachedEntry) {
          const retryIsNdc = offerCachedEntry.contentSource === 'NDC';
          try {
            let retryOfferPayload: unknown;
            let retryOfferUrl: string;

            if (retryIsNdc) {
              retryOfferUrl = `${baseUrl}/book/airoffer/reservationworkbench/${workbenchIds.workbenchId}/offers/buildfromcatalogproductofferings`;
              retryOfferPayload = this.requestBuilder.buildOfferBody(
                offerCachedEntry.catalogUuid,
                offerCachedEntry.productSelections,
              );
            } else {
              // GDS: always use full-payload buildfromproducts even on retry.
              // Reference-based payloads produce misfit offers that Travelport
              // rejects or reprice at different rates.
              retryOfferUrl = `${baseUrl}/book/airoffer/reservationworkbench/${workbenchIds.workbenchId}/offers/buildfromproducts`;
              retryOfferPayload = this.payloadBuilder.buildFromProducts(offerCachedEntry);
            }

            const retryOfferStep = await this.httpHelper.requestStep(
              'commit-retry-add-offer',
              retryOfferUrl,
              {
                method: 'POST',
                headers: sessionHeaders,
                body: JSON.stringify(retryOfferPayload),
                responseType: 'json',
              },
            );
            steps.push(retryOfferStep);
            this.httpHelper.applySetCookies(
              sessionHeaders,
              cookieJar,
              retryOfferStep.setCookie,
            );

            wf(
              'Commit retry add-offer status=%s ok=%s duration=%sms',
              retryOfferStep.status,
              retryOfferStep.ok,
              retryOfferStep.durationMs,
            );

            if (retryOfferStep.ok) {
              const retryOfferIdentifiers =
                this.responseParser.extractOfferIdentifiers(retryOfferStep.response);
              identifiers.offerRef = retryOfferIdentifiers.offerRef ?? retryOfferIdentifiers.id;
              identifiers.offerIdentifierValue = retryOfferIdentifiers.value;
              identifiers.offerIdentifierAuthority = retryOfferIdentifiers.authority;
              wf(
                'Commit retry offer identifiers: ref=%s value=%s',
                identifiers.offerRef,
                identifiers.offerIdentifierValue,
              );
            } else {
              wfWarn('Commit retry add-offer FAILED — aborting retry, fare no longer available');
              return { ok: false, failedStep: 'commit-retry-add-offer', steps, identifiers, message: 'Fare no longer available — add-offer failed on retry' };
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            wfWarn('Commit retry add-offer threw: %s — aborting retry', msg);
            return { ok: false, failedStep: 'commit-retry-add-offer', steps, identifiers, message: `Add-offer threw on retry: ${msg}` };
          }
        }
      }

      wf('=== COMMIT BOOKING (attempt %d) ===', commitAttempt + 1);
      const commitBody: Record<string, unknown> = {
        '@type': 'ReservationQueryCommitReservation',
      };
      wf(
        'Commit URL: %s',
        `${baseUrl}/book/reservation/reservations/${workbenchIds.workbenchId}`,
      );
      commitBookingStep = await this.httpHelper.requestStep(
        'commit-booking',
        `${baseUrl}/book/reservation/reservations/${workbenchIds.workbenchId}`,
        {
          method: 'POST',
          headers: sessionHeaders,
          body: JSON.stringify(commitBody),
          responseType: 'json',
        },
      );
      steps.push(commitBookingStep);
      this.httpHelper.applySetCookies(
        sessionHeaders,
        cookieJar,
        commitBookingStep.setCookie,
      );

      wf(
        'Commit booking status=%s ok=%s duration=%sms',
        commitBookingStep.status,
        commitBookingStep.ok,
        commitBookingStep.durationMs,
      );

      if (process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true') {
        const rawBody =
          typeof commitBookingStep.response === 'object'
            ? JSON.stringify(commitBookingStep.response)
            : String(commitBookingStep.response ?? '');
        const rawLen = rawBody.length;
        this.logger.log(
          `[TRAVELPORT] Raw commit-booking response (${rawLen} chars): ${
            rawLen > 50000
              ? rawBody.slice(0, 50000) + `\n... [TRUNCATED, total ${rawLen} chars]`
              : rawBody
          }`,
        );
      }

      tentativeLocator = this.responseParser.extractLocatorCode(
        commitBookingStep.response,
      );
      wf('Tentative locator: %s', tentativeLocator);

      if (commitBookingStep.ok || tentativeLocator) {
        break; // Success — exit retry loop
      }

      // Check if this is a fare availability error worth retrying
      const commitErrors = this.responseParser.extractResultErrors(
        commitBookingStep.response as Record<string, unknown>,
      );
      const commitErrMsg = commitErrors.length > 0
        ? String((commitErrors[0] as Record<string, unknown>)?.Message ?? '')
        : '';
      const isFareAvailabilityError =
        commitErrMsg.includes('FARE IS NOT AVAILABLE') ||
        commitErrMsg.includes('FARE NOT AVAILABLE') ||
        commitErrMsg.includes('CLASS OF SERVICE') ||
        commitErrMsg.includes('NO LONGER AVAILABLE');

      if (commitAttempt < COMMIT_MAX_RETRIES && isFareAvailabilityError) {
        wfWarn(
          'COMMIT BOOKING FAILED (fare availability: %s) — will retry with fresh reprice + re-add-offer',
          commitErrMsg,
        );
        continue;
      }

      // Non-retryable or last attempt
      if (tentativeLocator) {
        wf('GDS locator found despite airline errors — treating as successful');
        identifiers.locatorCode = tentativeLocator;
      } else {
        wfWarn('COMMIT BOOKING FAILED with no GDS locator (errors: %s)', commitErrMsg);
        return { ok: false, failedStep: 'commit-booking', steps, identifiers };
      }
    }

    if (tentativeLocator) {
      wf('Commit booking OK. Locator: %s', tentativeLocator);
      identifiers.locatorCode = tentativeLocator;
      // Real supplier deadline (ticket-by date) from the commit response.
      // Missing/absent → callers fall back to the local enforcement window.
      const ticketingDeadline = this.responseParser.extractTicketingDeadline(
        commitBookingStep?.response,
      );
      if (ticketingDeadline) {
        identifiers.ticketingDeadline = ticketingDeadline.deadline;
        identifiers.ticketingDeadlineSource = ticketingDeadline.source;
        wf(
          'Supplier ticketing deadline: %s (%s)',
          ticketingDeadline.deadline,
          ticketingDeadline.source,
        );
      } else {
        wf('No supplier ticketing deadline in commit response — local window applies');
      }
    }

    if (!identifiers.locatorCode) {
      wfWarn('MISSING locatorCode in commit response');
      return {
        ok: false,
        failedStep: 'commit-booking-parse',
        steps,
        identifiers,
        message: 'Missing locator code in booking commit response.',
      };
    }

    if (input.skipTicketing) {
      return { ok: true, steps, identifiers };
    }

    // Post-commit workbench (ticketing)
    wf('=== POST-COMMIT WORKBENCH ===');
    wf('Building workbench from locator: %s', identifiers.locatorCode);
    const postCommitHeaders =
      this.requestBuilder.buildHeadersWithoutContentType(baseHeaders);
    this.httpHelper.applySetCookies(postCommitHeaders, cookieJar);

    const postCommitStep = await this.httpHelper.requestStep(
      'post-commit-workbench',
      `${baseUrl}/book/session/reservationworkbench/buildfromlocator?Locator=${encodeURIComponent(
        identifiers.locatorCode,
      )}`,
      {
        method: 'POST',
        headers: postCommitHeaders,
        responseType: 'json',
      },
    );
    steps.push(postCommitStep);
    this.httpHelper.applySetCookies(
      postCommitHeaders,
      cookieJar,
      postCommitStep.setCookie,
    );

    wf(
      'Post-commit workbench status=%s ok=%s duration=%sms',
      postCommitStep.status,
      postCommitStep.ok,
      postCommitStep.durationMs,
    );

    if (!postCommitStep.ok) {
      wfWarn('Post-commit workbench FAILED');
      return {
        ok: false,
        failedStep: 'post-commit-workbench',
        steps,
        identifiers,
      };
    }

    const ticketingWorkbench = this.responseParser.extractWorkbenchIdentifiers(
      postCommitStep.response,
      postCommitStep.headers,
    );

    wf(
      'Ticketing workbench: id=%s sessionId=%s',
      ticketingWorkbench.workbenchId,
      ticketingWorkbench.sessionId,
    );

    if (!ticketingWorkbench.workbenchId) {
      wfWarn('MISSING ticketing workbenchId');
      return {
        ok: false,
        failedStep: 'post-commit-workbench-parse',
        steps,
        identifiers,
        message: 'Missing ticketing workbench identifier.',
      };
    }

    identifiers.ticketingWorkbenchId = ticketingWorkbench.workbenchId;
    identifiers.ticketingSessionId = ticketingWorkbench.sessionId;
    wf('Ticketing workbench ready: id=%s', ticketingWorkbench.workbenchId);

    const ticketingOfferIdentifiers =
      this.responseParser.extractOfferIdentifiers(postCommitStep.response);
    identifiers.offerRef =
      ticketingOfferIdentifiers.offerRef ??
      ticketingOfferIdentifiers.id ??
      identifiers.offerRef;
    identifiers.offerIdentifierValue =
      ticketingOfferIdentifiers.value ?? identifiers.offerIdentifierValue;
    identifiers.offerIdentifierAuthority =
      ticketingOfferIdentifiers.authority ??
      identifiers.offerIdentifierAuthority;

    const ticketingPriceDetails = this.responseParser.extractPriceDetails(
      postCommitStep.response,
    );
    identifiers.priceCurrencyCode =
      ticketingPriceDetails.currencyCode ?? identifiers.priceCurrencyCode;
    identifiers.priceMinorUnit =
      ticketingPriceDetails.minorUnit ?? identifiers.priceMinorUnit;
    identifiers.priceAmount =
      ticketingPriceDetails.totalPrice ?? identifiers.priceAmount;

    const ticketingHeaders = this.requestBuilder.buildSessionHeaders(
      bookingHeaders,
      ticketingWorkbench.sessionId,
    );
    this.httpHelper.applySetCookies(ticketingHeaders, cookieJar);

    // ── Post-Commit Ancillaries: Baggage & Services ──
    // Must happen on a committed PNR workbench (post-commit), NOT pre-commit.
    if (baggageToAdd.length > 0 || servicesToAdd.length > 0) {
      wf('=== POST-COMMIT SHOP ANCILLARIES ===');
      const shopResult = await this.ancillaryService.reshopShopInWorkbench(
        ticketingWorkbench.workbenchId,
        ticketingWorkbench.sessionId,
      );
      const freshBaggageFromCommit = shopResult.baggage;
      const freshServicesFromCommit = shopResult.services;
      wf(
        'Post-commit shop: got %d fresh baggage, %d fresh service options',
        freshBaggageFromCommit.length,
        freshServicesFromCommit.length,
      );

      const { remapped: remappedBaggage, unmatched: unmatchedBaggage } =
        this.responseParser.remapAncillariesFromFreshOptions(
          baggageToAdd,
          freshBaggageFromCommit,
        );
      const { remapped: remappedServices, unmatched: unmatchedServices } =
        this.responseParser.remapAncillariesFromFreshOptions(
          servicesToAdd,
          freshServicesFromCommit,
        );

      if (unmatchedBaggage.length > 0) {
        wfWarn(
          'Unmatched baggage after re-shop — skipping: %s',
          unmatchedBaggage.join(', '),
        );
      }
      if (unmatchedServices.length > 0) {
        wfWarn(
          'Unmatched services after re-shop — skipping: %s',
          unmatchedServices.join(', '),
        );
      }

      if (remappedBaggage.length > 0 && ticketingWorkbench.workbenchId) {
        wf('=== POST-COMMIT ADD-BAGGAGE ===');
        const resolvedBaggageItems = remappedBaggage.map((item) => ({
          ...item,
          travelerRef: this.responseParser.resolveTravelerRef(
            item.travelerRef,
            identifiers.travelerIdMapping,
          ),
        }));
        const baggageAddBody = this.requestBuilder.buildBaggageAddBody(
          ticketingWorkbench.workbenchId,
          resolvedBaggageItems,
          travelerCount,
        );
        const baggageStep = await this.httpHelper.requestStep(
          'post-commit-add-baggage',
          `${baseUrl}/book/airoffer/reservationworkbench/${ticketingWorkbench.workbenchId}/offers/buildancillaryoffersfromcatalogofferings`,
          {
            method: 'POST',
            headers: ticketingHeaders,
            body: JSON.stringify(baggageAddBody),
            responseType: 'json',
          },
        );
        steps.push(baggageStep);
        this.httpHelper.applySetCookies(
          ticketingHeaders,
          cookieJar,
          baggageStep.setCookie,
        );
        wf(
          'Post-commit baggage status=%s ok=%s duration=%sms',
          baggageStep.status,
          baggageStep.ok,
          baggageStep.durationMs,
        );
        if (!baggageStep.ok) {
          wfWarn('Post-commit baggage FAILED — non-fatal, continuing');
        } else {
          wf('Post-commit baggage added OK');
        }
      }

      if (remappedServices.length > 0 && ticketingWorkbench.workbenchId) {
        wf('=== POST-COMMIT ADD-SERVICES ===');
        const resolvedServiceItems = remappedServices.map((item) => ({
          ...item,
          travelerRef: this.responseParser.resolveTravelerRef(
            item.travelerRef,
            identifiers.travelerIdMapping,
          ),
        }));
        const servicesAddBody = this.requestBuilder.buildServicesAddBody(
          ticketingWorkbench.workbenchId,
          resolvedServiceItems,
          travelerCount,
        );
        const servicesStep = await this.httpHelper.requestStep(
          'post-commit-add-services',
          `${baseUrl}/book/airoffer/reservationworkbench/${ticketingWorkbench.workbenchId}/offers/buildancillaryoffersfromcatalogofferings`,
          {
            method: 'POST',
            headers: ticketingHeaders,
            body: JSON.stringify(servicesAddBody),
            responseType: 'json',
          },
        );
        steps.push(servicesStep);
        this.httpHelper.applySetCookies(
          ticketingHeaders,
          cookieJar,
          servicesStep.setCookie,
        );
        wf(
          'Post-commit services status=%s ok=%s duration=%sms',
          servicesStep.status,
          servicesStep.ok,
          servicesStep.durationMs,
        );
        if (!servicesStep.ok) {
          wfWarn('Post-commit services FAILED — non-fatal, continuing');
        } else {
          wf('Post-commit services added OK');
        }
      }

      // Post-commit seat add — on committed workbench
      const seatSelections = identifiers.seatSelections;
      if (seatSelections && seatSelections.length > 0 && ticketingWorkbench.workbenchId) {
        wf('=== POST-COMMIT ADD-SEATS ===');
        for (let si = 0; si < seatSelections.length; si++) {
          const seat = seatSelections[si];
          const resolvedTravelerRef = this.responseParser.resolveTravelerRef(
            seat.travelerRef ?? `travelerRefId_1`,
            identifiers.travelerIdMapping,
          );
          const seatAddBody = this.requestBuilder.buildSeatAddBody(
            ticketingWorkbench.workbenchId,
            identifiers.offerIdentifierValue ?? ticketingWorkbench.workbenchId,
            resolvedTravelerRef,
            seat.seatNumber,
            seat.catalogOfferingsIdentifier,
            seat.catalogOfferingIdentifierValue,
            seat.ancillaryProductId,
          );
          const seatStep = await this.httpHelper.requestStep(
            `post-commit-add-seat-${si + 1}`,
            `${baseUrl}/book/airoffer/reservationworkbench/${ticketingWorkbench.workbenchId}/offers/buildancillaryoffersfromcatalogofferings`,
            {
              method: 'POST',
              headers: ticketingHeaders,
              body: JSON.stringify(seatAddBody),
              responseType: 'json',
            },
          );
          steps.push(seatStep);
          wf(
            'Post-commit seat %s status=%s ok=%s',
            seat.seatNumber,
            seatStep.status,
            seatStep.ok,
          );
          if (!seatStep.ok) {
            wfWarn('Post-commit seat %s FAILED — non-fatal — errors=%j', seat.seatNumber, seatStep.errors);
          } else {
            wf('Post-commit seat %s added OK', seat.seatNumber);
          }
        }
        identifiers.seatSelections = undefined;
      }

      // Commit ancillary changes to persist baggage/services/seats
      wf('=== POST-COMMIT ANCILLARY COMMIT ===');
      const ancillaryCommitStep = await this.httpHelper.requestStep(
        'post-commit-ancillary-commit',
        `${baseUrl}/book/reservation/reservations/${ticketingWorkbench.workbenchId}`,
        {
          method: 'POST',
          headers: ticketingHeaders,
          body: JSON.stringify({
            '@type': 'ReservationQueryCommitReservation',
          }),
          responseType: 'json',
        },
      );
      steps.push(ancillaryCommitStep);
      this.httpHelper.applySetCookies(
        ticketingHeaders,
        cookieJar,
        ancillaryCommitStep.setCookie,
      );
      wf(
        'Post-commit ancillary commit status=%s ok=%s duration=%sms',
        ancillaryCommitStep.status,
        ancillaryCommitStep.ok,
        ancillaryCommitStep.durationMs,
      );
      if (ancillaryCommitStep.ok) {
        wf('Ancillary commit OK');
      } else {
        wfWarn('Ancillary commit FAILED');
      }
    } else {
      wf('No baggage or services to add post-commit');
    }

    // FOP
    wf('=== FORM OF PAYMENT ===');
    const fopRef = `formOfPayment_${Date.now()}`;
    identifiers.fopRef = fopRef;
    wf(
      'FOP ref available=%s offerIdValue=%s',
      !!identifiers.offerIdentifierValue,
      identifiers.offerIdentifierValue
        ? identifiers.offerIdentifierValue.slice(0, 8) + '...'
        : 'n/a',
    );

    const fopStep = await this.httpHelper.requestStep(
      'form-of-payment',
      `${baseUrl}/payment/reservationworkbench/${ticketingWorkbench.workbenchId}/formofpayment`,
      {
        method: 'POST',
        headers: ticketingHeaders,
        body: JSON.stringify(this.requestBuilder.buildCashFopBody(fopRef)),
        responseType: 'json',
      },
    );
    steps.push(fopStep);
    this.httpHelper.applySetCookies(
      ticketingHeaders,
      cookieJar,
      fopStep.setCookie,
    );

    wf(
      'FOP status=%s ok=%s duration=%sms',
      fopStep.status,
      fopStep.ok,
      fopStep.durationMs,
    );

    if (!fopStep.ok) {
      wfWarn('FOP FAILED');
      return { ok: false, failedStep: 'form-of-payment', steps, identifiers };
    }

    const fopIdentifier = this.responseParser.extractFopIdentifier(
      fopStep.response,
    );
    identifiers.fopIdentifierAuthority = fopIdentifier.authority;
    identifiers.fopIdentifierValue = fopIdentifier.value;

    wf(
      'FOP identifier: %s',
      identifiers.fopIdentifierValue
        ? identifiers.fopIdentifierValue.slice(0, 8) + '...'
        : 'n/a',
    );

    if (!identifiers.fopIdentifierValue) {
      wfWarn('MISSING FOP identifier value');
      return {
        ok: false,
        failedStep: 'form-of-payment-parse',
        steps,
        identifiers,
        message: 'Missing form of payment identifier.',
      };
    }

    if (!identifiers.offerIdentifierValue) {
      wfWarn('MISSING offerIdentifierValue for payment');
      return {
        ok: false,
        failedStep: 'offer-identifier-parse',
        steps,
        identifiers,
        message: 'Missing offer identifier for payment.',
      };
    }

    // Payment
    wf('=== PAYMENT ===');
    const paymentStep = await this.httpHelper.requestStep(
      'payment',
      `${baseUrl}/paymentoffer/reservationworkbench/${ticketingWorkbench.workbenchId}/payments`,
      {
        method: 'POST',
        headers: ticketingHeaders,
        body: JSON.stringify(
          this.requestBuilder.buildPaymentBody(
            identifiers.offerRef ?? 'offer_1',
            identifiers.offerIdentifierValue,
            identifiers.fopRef ?? fopRef,
            'Travelport',
            identifiers.fopIdentifierValue,
            identifiers.priceCurrencyCode ?? 'USD',
            identifiers.priceMinorUnit ?? 2,
            identifiers.priceAmount ?? 1,
          ),
        ),
        responseType: 'json',
      },
    );
    steps.push(paymentStep);
    this.httpHelper.applySetCookies(
      ticketingHeaders,
      cookieJar,
      paymentStep.setCookie,
    );

    wf(
      'Payment status=%s ok=%s duration=%sms',
      paymentStep.status,
      paymentStep.ok,
      paymentStep.durationMs,
    );

    if (!paymentStep.ok) {
      wfWarn('Payment FAILED');
      return { ok: false, failedStep: 'payment', steps, identifiers };
    }

    identifiers.paymentIdentifierValue =
      this.responseParser.extractIdentifierValue(paymentStep.response, [
        'PaymentResponse',
        'Payment',
        'Identifier',
        'value',
      ]);
    wf('Payment identifier available=%s', !!identifiers.paymentIdentifierValue);

    // Ticketing commit
    wf('=== COMMIT TICKETING ===');
    const ticketingBody: Record<string, unknown> = {
      '@type': 'ReservationQueryCommitReservation',
    };

    const commitTicketingStep = await this.httpHelper.requestStep(
      'commit-ticketing',
      `${baseUrl}/book/reservation/reservations/${ticketingWorkbench.workbenchId}`,
      {
        method: 'POST',
        headers: ticketingHeaders,
        body: JSON.stringify(ticketingBody),
        responseType: 'json',
      },
    );
    steps.push(commitTicketingStep);
    this.httpHelper.applySetCookies(
      ticketingHeaders,
      cookieJar,
      commitTicketingStep.setCookie,
    );

    wf(
      'Ticketing commit status=%s ok=%s duration=%sms',
      commitTicketingStep.status,
      commitTicketingStep.ok,
      commitTicketingStep.durationMs,
    );

    if (!commitTicketingStep.ok) {
      wfWarn('Ticketing commit FAILED');
      return { ok: false, failedStep: 'commit-ticketing', steps, identifiers };
    }

    identifiers.locatorCode =
      this.responseParser.extractLocatorCode(commitTicketingStep.response) ??
      identifiers.locatorCode;
    wf('Ticketing commit locator: %s', identifiers.locatorCode);

    if (!identifiers.locatorCode) {
      wfWarn('MISSING locatorCode after ticketing');
      return {
        ok: false,
        failedStep: 'commit-ticketing-parse',
        steps,
        identifiers,
        message: 'Missing locator code after ticketing commit.',
      };
    }

    // Ticket list
    wf('=== TICKET LIST ===');
    const ticketStep = await this.httpHelper.requestStep(
      'ticket-list',
      `${baseUrl}/receipt/reservations/${encodeURIComponent(identifiers.locatorCode)}/receipts`,
      {
        method: 'GET',
        headers: ticketingHeaders,
        responseType: 'json',
      },
    );
    steps.push(ticketStep);
    this.httpHelper.applySetCookies(
      ticketingHeaders,
      cookieJar,
      ticketStep.setCookie,
    );

    wf(
      'Ticket list status=%s ok=%s duration=%sms',
      ticketStep.status,
      ticketStep.ok,
      ticketStep.durationMs,
    );

    if (!ticketStep.ok) {
      wfWarn(
        'Ticket list FAILED — falling back to /ticket/tickets/getbylocator',
      );
      // Official "5 - PNR or Ticket Change > Ticket Information > Ticket Display
      // by Locator" — works for both NDC and GDS.
      const byLocatorStep = await this.httpHelper.requestStep(
        'ticket-list-by-locator',
        `${baseUrl}/ticket/tickets/getbylocator`,
        {
          method: 'POST',
          headers: ticketingHeaders,
          body: JSON.stringify({
            '@type': 'TicketQueryGetByLocator',
            detailViewInd: true,
            Locator: {
              value: identifiers.locatorCode,
              locatorType: 'Locator',
              source: '1G',
            },
          }),
          responseType: 'json',
        },
      );
      steps.push(byLocatorStep);
      this.httpHelper.applySetCookies(
        ticketingHeaders,
        cookieJar,
        byLocatorStep.setCookie,
      );
      if (byLocatorStep.ok) {
        identifiers.ticketNumbers = this.responseParser.extractTicketNumbers(
          byLocatorStep.response,
        );
        wf(
          'Ticket numbers (getbylocator fallback): %j',
          identifiers.ticketNumbers,
        );
        if ((identifiers.ticketNumbers?.length ?? 0) > 0) {
          return { ok: true, steps, identifiers };
        }
      }
      wfWarn('Ticket list FAILED');
      return { ok: false, failedStep: 'ticket-list', steps, identifiers };
    }

    identifiers.ticketNumbers = this.responseParser.extractTicketNumbers(
      ticketStep.response,
    );
    wf('Ticket numbers: %j', identifiers.ticketNumbers);
    // Receipts responded OK but listed no tickets (common right after commit —
    // document generation can lag). Try getbylocator before failing the run.
    if ((identifiers.ticketNumbers?.length ?? 0) === 0) {
      wf('Receipts empty — trying /ticket/tickets/getbylocator');
      const byLocatorStep = await this.httpHelper.requestStep(
        'ticket-list-by-locator-empty',
        `${baseUrl}/ticket/tickets/getbylocator`,
        {
          method: 'POST',
          headers: ticketingHeaders,
          body: JSON.stringify({
            '@type': 'TicketQueryGetByLocator',
            detailViewInd: true,
            Locator: {
              value: identifiers.locatorCode,
              locatorType: 'Locator',
              source: '1G',
            },
          }),
          responseType: 'json',
        },
      );
      steps.push(byLocatorStep);
      this.httpHelper.applySetCookies(
        ticketingHeaders,
        cookieJar,
        byLocatorStep.setCookie,
      );
      if (byLocatorStep.ok) {
        const fromLocator = this.responseParser.extractTicketNumbers(
          byLocatorStep.response,
        );
        if ((fromLocator?.length ?? 0) > 0) {
          identifiers.ticketNumbers = fromLocator;
          wf('Ticket numbers (getbylocator): %j', identifiers.ticketNumbers);
        }
      }
    }

    // ── Ancillary verification ──
    // After ticketing, verify that requested ancillaries appear in the reservation.
    // Non-blocking — logs warnings for missing items but doesn't fail the booking.
    wf('=== ANCILLARY VERIFICATION ===');
    const ancillaryVerification =
      this.responseParser.verifyAncillariesInResponse(
        commitTicketingStep.response,
        {
          seatsRequested: seatsToAdd.length,
          mealsRequested: mealsToAdd.length,
          ancillaryOffersRequested: baggageToAdd.length + servicesToAdd.length,
        },
      );
    identifiers.ancillaryVerification = ancillaryVerification ?? undefined;
    if (ancillaryVerification) {
      wf(
        'Ancillary verification: seats=%d/%d meals=%d/%d offers=%d/%d',
        ancillaryVerification.seatsFound,
        ancillaryVerification.seatsRequested,
        ancillaryVerification.mealsFound,
        ancillaryVerification.mealsRequested,
        ancillaryVerification.ancillaryOffersFound,
        ancillaryVerification.ancillaryOffersRequested,
      );
      if (
        ancillaryVerification.seatsFound < ancillaryVerification.seatsRequested
      ) {
        wfWarn(
          'Seat verification: expected %d, found %d in reservation',
          ancillaryVerification.seatsRequested,
          ancillaryVerification.seatsFound,
        );
      }
      if (
        ancillaryVerification.mealsFound < ancillaryVerification.mealsRequested
      ) {
        wfWarn(
          'Meal verification: expected %d, found %d in reservation',
          ancillaryVerification.mealsRequested,
          ancillaryVerification.mealsFound,
        );
      }
      if (
        ancillaryVerification.ancillaryOffersFound <
        ancillaryVerification.ancillaryOffersRequested
      ) {
        wfWarn(
          'Ancillary offer verification: expected %d, found %d in reservation',
          ancillaryVerification.ancillaryOffersRequested,
          ancillaryVerification.ancillaryOffersFound,
        );
      }
    }

    wf('=== WORKFLOW COMPLETE ===');
    wf(
      'Locator=%s tickets=%d ancillaryVerify=%s',
      identifiers.locatorCode,
      identifiers.ticketNumbers?.length ?? 0,
      ancillaryVerification
        ? `${ancillaryVerification.seatsFound}/${ancillaryVerification.seatsRequested} seats, ${ancillaryVerification.mealsFound}/${ancillaryVerification.mealsRequested} meals, ${ancillaryVerification.ancillaryOffersFound}/${ancillaryVerification.ancillaryOffersRequested} offers`
        : 'skipped',
    );
    return { ok: true, steps, identifiers };
  }

  /**
   * Run the ticketing workflow on an already-committed reservation.
   */
  async runTicketingWorkflow(
    locatorCode: string,
    input: TravelportBookingWorkflowDto,
  ): Promise<{
    ok: boolean;
    failedStep?: string;
    identifiers: WorkflowIdentifiers;
    ticketNumbers?: string[];
    message?: string;
    steps?: WorkflowStepResult[];
  }> {
    const workflowStartTime = Date.now();
    const WORKFLOW_TIMEOUT_MS = 120000;
    const workflowId = randomUUID().slice(0, 8);
    const requestId = input.requestId ?? randomUUID().slice(0, 8);
    const tracePrefix = `[wf=${workflowId} req=${requestId}]`;
    const wf = (msg: string, ...args: unknown[]) => {
      if (process.env.ENABLE_PROVIDER_DEBUG_LOGS !== 'true') return;
      this.logger.log(`${tracePrefix} ${msg}`, ...args);
    };
    const wfWarn = (msg: string, ...args: unknown[]) =>
      this.logger.warn(`${tracePrefix} ${msg}`, ...args);

    const config = await this.httpHelper.resolveConfig(input);
    const token = await this.httpHelper.getAccessToken(config);

    const steps: WorkflowStepResult[] = [];
    const identifiers: WorkflowIdentifiers = {};
    const baseHeaders = this.requestBuilder.buildHeaders(
      config,
      token.access_token,
    );
    const cookieJar = new Map<string, string>();
    const baseUrl = `${config.baseUrl}/${config.acceptVersion}/air`;
    const bookingHeaders = { ...baseHeaders };

    const checkWorkflowTimeout = (stepName: string) => {
      const elapsed = Date.now() - workflowStartTime;
      if (elapsed > WORKFLOW_TIMEOUT_MS) {
        throw new BusinessError(
          'FLIGHTS_TICKETING_TIMEOUT',
          `Ticketing workflow timed out after ${elapsed}ms at step: ${stepName}. The reservation is held but not ticketed.`,
        );
      }
    };

    // Build workbench from locator
    wf('=== BUILD WORKBENCH FROM LOCATOR ===');
    checkWorkflowTimeout('build-from-locator');
    const postCommitHeaders =
      this.requestBuilder.buildHeadersWithoutContentType(baseHeaders);
    this.httpHelper.applySetCookies(postCommitHeaders, cookieJar);

    const postCommitStep = await this.httpHelper.requestStep(
      'ticketing-build-workbench',
      `${baseUrl}/book/session/reservationworkbench/buildfromlocator?Locator=${encodeURIComponent(locatorCode)}`,
      {
        method: 'POST',
        headers: postCommitHeaders,
        responseType: 'json',
      },
    );
    steps.push(postCommitStep);
    this.httpHelper.applySetCookies(
      postCommitHeaders,
      cookieJar,
      postCommitStep.setCookie,
    );

    wf(
      'Ticketing workbench status=%s ok=%s duration=%sms',
      postCommitStep.status,
      postCommitStep.ok,
      postCommitStep.durationMs,
    );

    if (!postCommitStep.ok) {
      return {
        ok: false,
        failedStep: 'ticketing-build-workbench',
        steps,
        identifiers,
      };
    }

    const ticketingWorkbench = this.responseParser.extractWorkbenchIdentifiers(
      postCommitStep.response,
      postCommitStep.headers,
    );

    if (!ticketingWorkbench.workbenchId) {
      return {
        ok: false,
        failedStep: 'ticketing-build-workbench-parse',
        identifiers,
        message: 'Missing ticketing workbench identifier.',
      };
    }

    identifiers.ticketingWorkbenchId = ticketingWorkbench.workbenchId;
    identifiers.ticketingSessionId = ticketingWorkbench.sessionId;
    wf('Ticketing workbench ready: id=%s', ticketingWorkbench.workbenchId);

    const ticketingOfferIds = this.responseParser.extractOfferIdentifiers(
      postCommitStep.response,
    );
    identifiers.offerRef = ticketingOfferIds.offerRef ?? ticketingOfferIds.id;
    identifiers.offerIdentifierValue = ticketingOfferIds.value;
    identifiers.offerIdentifierAuthority = ticketingOfferIds.authority;

    const ticketingPriceDetails = this.responseParser.extractPriceDetails(
      postCommitStep.response,
    );
    identifiers.priceCurrencyCode =
      ticketingPriceDetails.currencyCode ?? identifiers.priceCurrencyCode;
    identifiers.priceMinorUnit =
      ticketingPriceDetails.minorUnit ?? identifiers.priceMinorUnit;
    identifiers.priceAmount =
      ticketingPriceDetails.totalPrice ?? identifiers.priceAmount;

    const ticketingHeaders = this.requestBuilder.buildSessionHeaders(
      bookingHeaders,
      ticketingWorkbench.sessionId,
    );
    this.httpHelper.applySetCookies(ticketingHeaders, cookieJar);

    // FOP
    wf('=== FORM OF PAYMENT ===');
    checkWorkflowTimeout('form-of-payment');
    const fopRef = `formOfPayment_${Date.now()}`;
    identifiers.fopRef = fopRef;

    const fopStep = await this.httpHelper.requestStep(
      'ticketing-form-of-payment',
      `${baseUrl}/payment/reservationworkbench/${ticketingWorkbench.workbenchId}/formofpayment`,
      {
        method: 'POST',
        headers: ticketingHeaders,
        body: JSON.stringify(this.requestBuilder.buildCashFopBody(fopRef)),
        responseType: 'json',
      },
    );
    steps.push(fopStep);
    this.httpHelper.applySetCookies(
      ticketingHeaders,
      cookieJar,
      fopStep.setCookie,
    );

    wf(
      'FOP status=%s ok=%s duration=%sms',
      fopStep.status,
      fopStep.ok,
      fopStep.durationMs,
    );

    if (!fopStep.ok) {
      return {
        ok: false,
        failedStep: 'ticketing-form-of-payment',
        steps,
        identifiers,
      };
    }

    const fopIdentifier = this.responseParser.extractFopIdentifier(
      fopStep.response,
    );
    identifiers.fopIdentifierAuthority = fopIdentifier.authority;
    identifiers.fopIdentifierValue = fopIdentifier.value;

    if (!identifiers.fopIdentifierValue) {
      return {
        ok: false,
        failedStep: 'ticketing-form-of-payment-parse',
        steps,
        identifiers,
        message: 'Missing FOP identifier.',
      };
    }

    if (!identifiers.offerIdentifierValue) {
      return {
        ok: false,
        failedStep: 'ticketing-offer-identifier-parse',
        steps,
        identifiers,
        message: 'Missing offer identifier for payment.',
      };
    }

    // Payment
    wf('=== PAYMENT ===');
    checkWorkflowTimeout('payment');

    const paymentStep = await this.httpHelper.requestStep(
      'ticketing-payment',
      `${baseUrl}/paymentoffer/reservationworkbench/${ticketingWorkbench.workbenchId}/payments`,
      {
        method: 'POST',
        headers: ticketingHeaders,
        body: JSON.stringify(
          this.requestBuilder.buildPaymentBody(
            identifiers.offerRef ?? 'offer_1',
            identifiers.offerIdentifierValue,
            identifiers.fopRef ?? fopRef,
            'Travelport',
            identifiers.fopIdentifierValue,
            identifiers.priceCurrencyCode ?? 'USD',
            identifiers.priceMinorUnit ?? 2,
            identifiers.priceAmount ?? 1,
          ),
        ),
        responseType: 'json',
      },
    );
    steps.push(paymentStep);
    this.httpHelper.applySetCookies(
      ticketingHeaders,
      cookieJar,
      paymentStep.setCookie,
    );

    wf(
      'Payment status=%s ok=%s duration=%sms',
      paymentStep.status,
      paymentStep.ok,
      paymentStep.durationMs,
    );

    if (!paymentStep.ok) {
      return {
        ok: false,
        failedStep: 'ticketing-payment',
        steps,
        identifiers,
      };
    }

    identifiers.paymentIdentifierValue =
      this.responseParser.extractIdentifierValue(paymentStep.response, [
        'PaymentResponse',
        'Payment',
        'Identifier',
        'value',
      ]);

    // Ticketing commit
    wf('=== COMMIT ===');
    checkWorkflowTimeout('commit-ticketing');
    const ticketingBody: Record<string, unknown> = {
      '@type': 'ReservationQueryCommitReservation',
    };

    const commitTicketingStep = await this.httpHelper.requestStep(
      'ticketing-commit',
      `${baseUrl}/book/reservation/reservations/${ticketingWorkbench.workbenchId}`,
      {
        method: 'POST',
        headers: ticketingHeaders,
        body: JSON.stringify(ticketingBody),
        responseType: 'json',
      },
    );
    steps.push(commitTicketingStep);
    this.httpHelper.applySetCookies(
      ticketingHeaders,
      cookieJar,
      commitTicketingStep.setCookie,
    );

    wf(
      'Ticketing commit status=%s ok=%s duration=%sms',
      commitTicketingStep.status,
      commitTicketingStep.ok,
      commitTicketingStep.durationMs,
    );

    if (!commitTicketingStep.ok) {
      const commitErr =
        commitTicketingStep.errors?.length
          ? JSON.stringify(commitTicketingStep.errors).slice(0, 500)
          : `HTTP ${commitTicketingStep.status}`;
      wfWarn('Ticketing commit FAILED: %s', commitErr);
      return {
        ok: false,
        failedStep: 'ticketing-commit',
        steps,
        identifiers,
        message: `Ticketing commit rejected by supplier: ${commitErr}`,
      };
    }

    const ticketedLocator =
      this.responseParser.extractLocatorCode(commitTicketingStep.response) ??
      locatorCode;
    identifiers.locatorCode = ticketedLocator;

    // Retrieve reservation
    wf('=== RETRIEVE RESERVATION ===');
    checkWorkflowTimeout('retrieve-reservation');

    const retrieveStep = await this.httpHelper.requestStep(
      'ticketing-retrieve-reservation',
      `${baseUrl}/book/reservation/reservations/${encodeURIComponent(ticketedLocator)}`,
      {
        method: 'GET',
        headers: ticketingHeaders,
        responseType: 'json',
      },
    );
    steps.push(retrieveStep);
    this.httpHelper.applySetCookies(
      ticketingHeaders,
      cookieJar,
      retrieveStep.setCookie,
    );

    wf(
      'Retrieve reservation status=%s ok=%s duration=%sms',
      retrieveStep.status,
      retrieveStep.ok,
      retrieveStep.durationMs,
    );

    if (retrieveStep.ok) {
      identifiers.ticketNumbers =
        this.responseParser.extractTicketNumbersFromReservation(
          retrieveStep.response,
        );
      wf('Ticket numbers: %j', identifiers.ticketNumbers);
    } else {
      wf('Retrieve failed, falling back to receipt endpoint');
      const ticketStep = await this.httpHelper.requestStep(
        'ticketing-ticket-list',
        `${baseUrl}/receipt/reservations/${encodeURIComponent(ticketedLocator)}/receipts`,
        {
          method: 'GET',
          headers: ticketingHeaders,
          responseType: 'json',
        },
      );
      steps.push(ticketStep);
      this.httpHelper.applySetCookies(
        ticketingHeaders,
        cookieJar,
        ticketStep.setCookie,
      );

      if (ticketStep.ok) {
        identifiers.ticketNumbers = this.responseParser.extractTicketNumbers(
          ticketStep.response,
        );
        wf('Ticket numbers (receipt fallback): %j', identifiers.ticketNumbers);
      }
    }

    // Last resort: ticket display by locator (verified live shape:
    // TicketListResponse.TicketID[].Identifier.value). Commit + retrieve
    // can both succeed while carrying no ticket nodes (seen on some
    // channels) — never mark ticketed with zero numbers without this check.
    // Ticket issuance is async server-side: retry a few times with a delay.
    if ((identifiers.ticketNumbers?.length ?? 0) === 0) {
      wf('No ticket numbers yet — ticket display by locator');
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1) {
          await new Promise((resolve) => setTimeout(resolve, 8000));
        }
        const lookupStep = await this.httpHelper.requestStep(
          'ticketing-getbylocator',
          `${baseUrl}/ticket/tickets/getbylocator`,
          {
            method: 'POST',
            headers: ticketingHeaders,
            body: JSON.stringify({
              '@type': 'TicketQueryGetByLocator',
              detailViewInd: true,
              Locator: {
                value: ticketedLocator,
                locatorType: 'Locator',
                source: '1G',
              },
            }),
            responseType: 'json',
          },
        );
        steps.push(lookupStep);
        if (lookupStep.ok) {
          identifiers.ticketNumbers =
            this.responseParser.extractTicketNumbers(lookupStep.response);
          wf('Ticket numbers (getbylocator): %j', identifiers.ticketNumbers);
          if ((identifiers.ticketNumbers?.length ?? 0) > 0) break;
        }
      }
    }

    if ((identifiers.ticketNumbers?.length ?? 0) === 0) {
      wfWarn(
        'Ticketing commit+retrieve+lookup yielded zero ticket numbers for %s — refusing ticketed status',
        ticketedLocator,
      );
      return {
        ok: false,
        failedStep: 'ticketing-no-ticket-numbers',
        steps,
        identifiers,
        message: `Ticketing finished without ticket numbers for ${ticketedLocator}. PNR is held — verify via supplier lookup before charging/confirming.`,
      };
    }

    wf(
      '=== TICKETING COMPLETE === locator=%s tickets=%d',
      ticketedLocator,
      identifiers.ticketNumbers?.length ?? 0,
    );
    return { ok: true, identifiers };
  }

  /**
   * Standalone ticket-number lookup by PNR (no workbench/session needed).
   * Used to backfill bookings whose ticketing finished before numbers were
   * captured. Non-fatal — returns [] on any failure.
   */
  async fetchTicketNumbersByLocator(locatorCode: string): Promise<string[]> {
    try {
      const config = await this.httpHelper.resolveConfig({
        accessGroup: undefined,
        pcc: undefined,
      } as any);
      const token = await this.httpHelper.getAccessToken(config);
      const headers = this.requestBuilder.buildHeaders(
        config,
        token.access_token,
      );
      const baseUrl = `${config.baseUrl}/${config.acceptVersion}/air`;
      const step = await this.httpHelper.requestStep(
        'ticket-numbers-by-locator',
        `${baseUrl}/ticket/tickets/getbylocator`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            '@type': 'TicketQueryGetByLocator',
            detailViewInd: true,
            Locator: { value: locatorCode, locatorType: 'Locator', source: '1G' },
          }),
          responseType: 'json',
        },
      );
      if (!step.ok) return [];
      return this.responseParser.extractTicketNumbers(step.response);
    } catch {
      return [];
    }
  }

  async reprice(
    searchKey: string,
    offerId: string,
  ): Promise<{ amount: number; currency: string }> {
    const cachedEntry = await this.selectedOfferCache.retrieve(
      searchKey,
      offerId,
    );
    if (!cachedEntry) {
      throw new BusinessError(
        'FLIGHTS_OFFER_EXPIRED',
        'The selected offer is no longer available. Please perform a new search.',
      );
    }

    const isNdc = cachedEntry.contentSource === 'NDC';

    // Use env/default config for repricing — no need for request-specific accessGroup/PCC
    const config = await this.httpHelper.resolveConfig({
      accessGroup: undefined,
      pcc: undefined,
    } as any);
    const token = await this.httpHelper.getAccessToken(config);
    const baseHeaders = this.requestBuilder.buildHeaders(
      config,
      token.access_token,
    );
    const baseUrl = `${config.baseUrl}/${config.acceptVersion}/air`;

    let requestBody: unknown;
    let priceEndpoint: string;

    if (isNdc) {
      // NDC: Use reference-based payload (catalog product offering identifiers)
      priceEndpoint = `${baseUrl}/price/offers/buildfromcatalogproductofferings`;
      requestBody = this.requestBuilder.buildOfferBody(
        cachedEntry.catalogUuid,
        cachedEntry.productSelections,
      );
    } else {
      // GDS: Use full payload (specific flight criteria). No fallback to
      // reference-based endpoints — buildfromproducts must succeed or fail.
      priceEndpoint = `${baseUrl}/price/offers/buildfromproducts`;
      requestBody = this.payloadBuilder.buildFromProducts(cachedEntry);
    }

    if (process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true') {
      this.logger.log(
        `[Reprice] endpoint=${priceEndpoint.includes('buildfromproducts') ? 'buildfromproducts' : 'buildfromcatalogproductofferings'} contentSource=${cachedEntry.contentSource ?? 'unset'} catalogUuid=${cachedEntry.catalogUuid?.slice(0, 8)}... productSelections=${cachedEntry.productSelections?.length ?? 0}`,
      );
    }

    const response = await this.httpClient.request(priceEndpoint, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify(requestBody),
      responseType: 'json',
    });

    if (!response.ok) {
      throw new BusinessError(
        'FLIGHTS_REPRICE_FAILED',
        `Fresh price check failed: Travelport returned status ${response.status}`,
      );
    }

    const travelportErrors = this.responseParser.extractResultErrors(response.data);
    if (travelportErrors.length > 0) {
      const firstErr = travelportErrors[0] as Record<string, unknown> | undefined;
      const errMsg = String(firstErr?.Message ?? firstErr?.message ?? JSON.stringify(firstErr) ?? '');
      const upperErrMsg = errMsg.toUpperCase();

      // Fare-availability errors mean the cabin/class is sold out — block payment immediately
      const isFareError =
        upperErrMsg.includes('FARE IS NOT AVAILABLE') ||
        upperErrMsg.includes('FARE NOT AVAILABLE') ||
        upperErrMsg.includes('NO AVAILABLE FARES') ||
        upperErrMsg.includes('NO LONGER AVAILABLE') ||
        upperErrMsg.includes('CLASS OF SERVICE') ||
        upperErrMsg.includes('FLIGHT SEGMENTS UNAVAILABLE') ||
        upperErrMsg.includes('UNAVAILABLE IN THE REQUESTED CLASS') ||
        upperErrMsg.includes('REQUESTED CABIN');

      if (isFareError) {
        throw new BusinessError(
          'FLIGHTS_OFFER_UNAVAILABLE',
          `The selected fare is no longer available: ${errMsg}`,
          undefined,
          { offerId, provider: 'travelport', reason: errMsg },
        );
      }

      const snippet = JSON.stringify(response.data ?? '(null)').slice(0, 2000);
      this.logger.warn(
        `[Reprice] Travelport returned errors in 200: ${errMsg} | raw: ${snippet}`,
      );
      throw new BusinessError(
        'FLIGHTS_REPRICE_FAILED',
        `Travelport repricing returned error: ${errMsg}`,
      );
    }

    const priceDetails = this.responseParser.extractPriceDetails(response.data);
    if (
      typeof priceDetails.totalPrice !== 'number' ||
      !priceDetails.currencyCode
    ) {
      const snippet = JSON.stringify(response.data ?? '(null)').slice(0, 2000);
      this.logger.warn(
        `[Reprice] extractPriceDetails FAILED — raw snippet: ${snippet}`,
      );
      throw new BusinessError(
        'FLIGHTS_REPRICE_FAILED',
        'Could not extract price from Travelport repricing response',
      );
    }

    if (process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true') {
      this.logger.log(
        `Fresh reprice for ${offerId}: ${priceDetails.currencyCode} ${priceDetails.totalPrice}`,
      );
    }

    return {
      amount: priceDetails.totalPrice,
      currency: priceDetails.currencyCode,
    };
  }

  /**
   * Price an offer and return priced offer identifiers needed for BuildFromOffer.
   * Used by the checkout session flow to get the priced offer identifier
   * required for AncillaryOfferingsBuildFromOffer.
   */
  async priceForCheckoutSession(
    searchKey: string,
    offerId: string,
    useCatalogOfferings?: boolean,
  ): Promise<{
    amount: number;
    currency: string;
    pricedOfferIdentifierValue: string;
    pricedOfferIdentifierAuthority?: string;
    /** Fare conditions (refund/change penalties) from the live price response. */
    fareRules?: TravelportFarePolicies;
  }> {
    const cachedEntry = await this.selectedOfferCache.retrieve(
      searchKey,
      offerId,
    );
    if (!cachedEntry) {
      throw new BusinessError(
        'FLIGHTS_OFFER_EXPIRED',
        'The selected offer is no longer available. Please perform a new search.',
      );
    }

    const isNdc = cachedEntry.contentSource === 'NDC';
    const config = await this.httpHelper.resolveConfig({
      accessGroup: undefined,
      pcc: undefined,
    } as any);
    const token = await this.httpHelper.getAccessToken(config);
    const baseHeaders = this.requestBuilder.buildHeaders(
      config,
      token.access_token,
    );
    const baseUrl = `${config.baseUrl}/${config.acceptVersion}/air`;

    let requestBody: unknown;
    let priceEndpoint: string;

    if (isNdc || useCatalogOfferings) {
      priceEndpoint = `${baseUrl}/price/offers/buildfromcatalogproductofferings`;
      requestBody = this.requestBuilder.buildOfferBody(
        cachedEntry.catalogUuid,
        cachedEntry.productSelections,
      );
    } else {
      priceEndpoint = `${baseUrl}/price/offers/buildfromproducts`;
      requestBody = this.payloadBuilder.buildFromProducts(cachedEntry);
    }

    if (useCatalogOfferings) {
      this.logger.log(
        `[priceForCheckoutSession] Multi-city buildcatalog: catalogUuid=${cachedEntry.catalogUuid}, selections=${cachedEntry.productSelections.length}`,
      );
    }

    const response = await this.httpClient.request(priceEndpoint, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify(requestBody),
      responseType: 'json',
    });

    if (!response.ok) {
      throw new BusinessError(
        'FLIGHTS_REPRICE_FAILED',
        `Fresh price check failed: Travelport returned status ${response.status}`,
      );
    }

    const travelportErrors = this.responseParser.extractResultErrors(
      response.data,
    );
    if (travelportErrors.length > 0) {
      const firstErr = travelportErrors[0] as
        | Record<string, unknown>
        | undefined;
      const errMsg = String(
        firstErr?.Message ?? firstErr?.message ?? JSON.stringify(firstErr) ?? '',
      );
      const upperErrMsg = errMsg.toUpperCase();

      const isFareError =
        upperErrMsg.includes('FARE IS NOT AVAILABLE') ||
        upperErrMsg.includes('FARE NOT AVAILABLE') ||
        upperErrMsg.includes('NO AVAILABLE FARES') ||
        upperErrMsg.includes('NO LONGER AVAILABLE') ||
        upperErrMsg.includes('CLASS OF SERVICE') ||
        upperErrMsg.includes('FLIGHT SEGMENTS UNAVAILABLE') ||
        upperErrMsg.includes('UNAVAILABLE IN THE REQUESTED CLASS') ||
        upperErrMsg.includes('REQUESTED CABIN');

      if (isFareError) {
        throw new BusinessError(
          'FLIGHTS_OFFER_UNAVAILABLE',
          `The selected fare is no longer available: ${errMsg}`,
          undefined,
          { offerId, provider: 'travelport', reason: errMsg },
        );
      }

      const snippet = JSON.stringify(response.data ?? '(null)').slice(0, 2000);
      this.logger.warn(
        `[PriceForSession] Travelport returned errors in 200: ${errMsg} | raw: ${snippet}`,
      );
      throw new BusinessError(
        'FLIGHTS_REPRICE_FAILED',
        `Travelport repricing returned error: ${errMsg}`,
      );
    }

    const priceDetails = this.responseParser.extractPriceDetails(response.data);
    if (
      typeof priceDetails.totalPrice !== 'number' ||
      !priceDetails.currencyCode
    ) {
      const snippet = JSON.stringify(response.data ?? '(null)').slice(0, 2000);
      this.logger.warn(
        `[PriceForSession] extractPriceDetails FAILED — raw snippet: ${snippet}`,
      );
      throw new BusinessError(
        'FLIGHTS_REPRICE_FAILED',
        'Could not extract price from Travelport repricing response',
      );
    }

    const offerIdentifier = this.responseParser.extractPricedOfferIdentifier(
      response.data,
    );
    if (!offerIdentifier?.value) {
      const topKeys =
        response.data && typeof response.data === 'object'
          ? Object.keys(response.data).join(', ')
          : typeof response.data;
      const snippet = JSON.stringify(response.data ?? '(null)').slice(0, 2000);
      this.logger.warn(
        `[PriceForSession] PricedOfferIdentifier extraction FAILED — top-level keys: ${topKeys} | raw snippet: ${snippet}`,
      );
      throw new BusinessError(
        'FLIGHTS_REPRICE_FAILED',
        `Could not extract priced offer identifier from Travelport repricing response. Raw top-keys: ${topKeys}`,
      );
    }

    if (process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true') {
      this.logger.log(
        `[PriceForSession] Priced ${offerId}: ${priceDetails.currencyCode} ${priceDetails.totalPrice} ident=${offerIdentifier.value.slice(0, 16)}...`,
      );
    }

    return {
      amount: priceDetails.totalPrice,
      currency: priceDetails.currencyCode,
      pricedOfferIdentifierValue: offerIdentifier.value,
      pricedOfferIdentifierAuthority: offerIdentifier.authority,
      fareRules: await this.enrichFareRulesFromOffer(
        baseUrl,
        baseHeaders,
        offerIdentifier.value,
        extractFareRulesFromPriceResponse(response.data),
      ),
    };
  }

  /**
   * Live fare-rules enrichment (v11 `farerule/farerules/fromoffer`): the
   * price response carries the policy skeleton but often no penalty amount,
   * which is why cards show "fee not specified". Best-effort and non-fatal —
   * any failure keeps the price-derived rules. Live wins only where it adds
   * a concrete fee the base lacks.
   */
  private async enrichFareRulesFromOffer(
    baseUrl: string,
    baseHeaders: Record<string, string>,
    offerIdentifierValue: string,
    base: TravelportFarePolicies | undefined,
  ): Promise<TravelportFarePolicies | undefined> {
    // Local search ids (o0, o1, …) are not supplier offer identifiers —
    // fromoffer answers OFFER NOT FOUND for them. Skip the call.
    if (/^o\d+$/i.test(offerIdentifierValue)) return base;
    try {
      const url =
        `${baseUrl}/farerule/farerules/fromoffer` +
        `?offerIdentifier=${encodeURIComponent(offerIdentifierValue)}` +
        `&fareRuleType=Structured`;
      const res = await this.httpClient.request(url, {
        method: 'GET',
        headers: baseHeaders,
        responseType: 'json',
      });
      if (!res.ok) return base;
      const live = extractFareRulesFromFareRulesResponse(res.data);
      if (!live) {
        const snippet = JSON.stringify(res.data ?? '(null)').slice(0, 1000);
        this.logger.warn(
          `[FareRules] fromoffer carried no parseable penalties for ${offerIdentifierValue.slice(0, 16)}... Sample: ${snippet}`,
        );
        return base;
      }
      return enrichWithLiveFareRules(base, live);
    } catch {
      return base;
    }
  }

  /**
   * Extract the first OfferIdentifier from an AirPrice response.
   * Looks under OfferQueryResponse → Response → Offer[0] → OfferIdentifier.
   */
  private verifyAncillariesInResponse(
    response: unknown,
    requested: {
      seatsRequested: number;
      mealsRequested: number;
      ancillaryOffersRequested: number;
    },
  ):
    | {
        seatsFound: number;
        mealsFound: number;
        ancillaryOffersFound: number;
        seatsRequested: number;
        mealsRequested: number;
        ancillaryOffersRequested: number;
      }
    | undefined {
    if (!response || typeof response !== 'object') return undefined;

    const result = {
      seatsFound: 0,
      mealsFound: 0,
      ancillaryOffersFound: 0,
      seatsRequested: requested.seatsRequested,
      mealsRequested: requested.mealsRequested,
      ancillaryOffersRequested: requested.ancillaryOffersRequested,
    };

    if (
      result.seatsRequested === 0 &&
      result.mealsRequested === 0 &&
      result.ancillaryOffersRequested === 0
    ) {
      return result; // Nothing requested, nothing to verify
    }

    const queue: unknown[] = [response];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;

      const record = current as Record<string, unknown>;

      // Check for seat assignments
      if (record.SeatAssignment || record.seatNumber || record.SeatIdentifier) {
        result.seatsFound++;
      }

      // Check for SSR codes (meal requests)
      if (record.SSRCode || record.ssrCode) {
        result.mealsFound++;
      }

      // Check for ancillary offers (baggage/services)
      if (record['@type'] && typeof record['@type'] === 'string') {
        const type = record['@type'];
        if (
          type.includes('Ancillary') ||
          type.includes('Baggage') ||
          type.includes('SeatOffer')
        ) {
          result.ancillaryOffersFound++;
        }
      }

      // Queue children for traversal
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }

    return result;
  }
}
