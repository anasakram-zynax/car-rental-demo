import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FlightsProviderRegistryService } from './flights-provider-registry.service';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CacheService } from '../../../../shared/cache/cache.service';
import { SelectedOfferCacheService } from './selected-offer-cache.service';
import { SearchJobService } from '../../../search-job/search-job.service';
import { FlightDisplayEnrichmentService } from './flight-display-enrichment.service';
import { FlightResponseMapper } from './flight-response.mapper';
import type { FlightSearchDto } from '../../api/dto/flight-search.dto';
import type { NormalizedFlightOffer, NormalizedFlightSearchResponse, SelectedOfferCacheEntry } from '../../domain/entities/flight-search-response';

const SEARCH_SESSION_TTL_SECONDS = 900; // 15 minutes
const DEFAULT_PROVIDER_TIMEOUT_MS = 30000; // 30 seconds per provider

export interface ProviderSearchResult {
  provider: string;
  status: 'ok' | 'failed';
  errorCode?: string;
  errorMessage?: string;
  offerCount: number;
  elapsedMs: number;
}

export interface FlightSearchSession {
  searchKey: string;
  createdAt: string;
  expiresAt: string;
  criteria: FlightSearchDto;
  providers: Record<string, ProviderSearchResult>;
}

export interface CombinedFlightSearchResponse {
  searchKey: string;
  createdAt: string;
  expiresAt: string;
  warnings: string[];
  offers: NormalizedFlightOffer[];
  providerResults: ProviderSearchResult[];
  meta?: Record<string, unknown>;
}

/**
 * Orchestrates multi-provider flight search.
 *
 * Phase 3 implementation:
 * 1. Loads all search-enabled providers from the registry
 * 2. Runs each provider search in parallel with per-provider timeout
 * 3. Collects offers and warnings
 * 4. Applies markup via MarkupService
 * 5. Stores a compact search session by searchKey
 * 6. Returns combined results
 */
@Injectable()
export class FlightSearchAggregatorService {
  private readonly logger = new Logger(FlightSearchAggregatorService.name);
  private providerTimeoutMs: number;

  constructor(
    private readonly providerRegistry: FlightsProviderRegistryService,
    private readonly cacheService: CacheService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly searchJobService?: SearchJobService,
    @Optional() private readonly selectedOfferCache?: SelectedOfferCacheService,
    @Optional() private readonly enrichmentService?: FlightDisplayEnrichmentService,
    @Optional() private readonly mapper?: FlightResponseMapper,
  ) {
    this.providerTimeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS;
  }

  /**
   * Override the per-provider search timeout (for testing).
   */
  setProviderTimeoutMs(ms: number): void {
    this.providerTimeoutMs = ms;
  }

  /**
   * Admin control surface: restrict search to the agent's allowed flight
   * suppliers (null/empty = all). Skipped providers are reported as
   * completed-empty on SSE jobs so the frontend never waits on them.
   */
  private async filterProvidersForAgent<T extends { key: string }>(
    providers: T[],
    agentProfileId: string | undefined,
    searchId?: string,
  ): Promise<T[]> {
    if (!agentProfileId || !this.prisma) return providers;
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { allowedFlightProviders: true },
    }).catch(() => null);
    const allowed = (profile?.allowedFlightProviders as string[] | null) ?? [];
    if (allowed.length === 0) return providers;
    const allow = new Set(allowed.map((k) => k.toLowerCase()));
    const kept = providers.filter((p) => allow.has(p.key.toLowerCase()));
    const skipped = providers.filter((p) => !allow.has(p.key.toLowerCase()));
    if (skipped.length > 0) {
      this.logger.log(`[AGGREGATOR] agent ${agentProfileId}: suppliers restricted — skipped ${skipped.map((p) => p.key).join(',')}`);
      if (searchId && this.searchJobService) {
        for (const p of skipped) {
          await this.searchJobService.reportSupplierCompleted(searchId, p.key, 0, 0).catch(() => {});
        }
      }
    }
    return kept;
  }

  /**
   * Get info about search-enabled providers for job creation.
   */
  async getSearchProviderInfo(): Promise<Array<{ key: string; label: string }>> {
    const providers = await this.providerRegistry.getSearchProviders();
    const LABELS: Record<string, string> = { travelport: 'Travelport', duffel: 'Duffel', amadeus: 'Amadeus' };
    return providers.map((p) => ({ key: p.key, label: LABELS[p.key] ?? p.key }));
  }

  /**
   * Run a combined search across all search-enabled flight providers.
   * Returns results even if some providers fail — partial results + warnings.
   * When searchId is provided, emits real-time events via SearchJobService.
   */
  async aggregateSearch(input: FlightSearchDto, searchId?: string, agentProfileId?: string): Promise<CombinedFlightSearchResponse> {
    if (input.tripType === 'multi_city') {
      this.logger.log(
        `[MULTI-CITY] Aggregator START — legs: ${input.legs?.length ?? 0}, from: ${input.from}, to: ${input.to}`,
      );
    }

    // Provider discovery must not hang — fail fast if DB/cache is unresponsive.
    const discovered = await Promise.race([
      this.providerRegistry.getSearchProviders(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Provider discovery timed out — database may be unreachable')), 5000),
      ),
    ]);
    // ponytail: allowlist is best-effort — lookup failure = all providers (never strand a search).
    const providers = await this.filterProvidersForAgent(discovered, agentProfileId, searchId);

    if (searchId && this.searchJobService && providers.length === 0) {
      await this.searchJobService.failJob(searchId, 'ALL_SUPPLIERS_FAILED');
      return this.emptyResponse('No flight search providers are enabled. Please enable at least one provider in admin settings.');
    }

    if (providers.length === 0) {
      return this.emptyResponse('No flight search providers are enabled. Please enable at least one provider in admin settings.');
    }

    const searchKey = this.generateSearchKey();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SEARCH_SESSION_TTL_SECONDS * 1000);

    // Enriched offers returned by the per-provider progressive patch pipeline.
    // Reused for the final combined response so the controller doesn't have to
    // re-enrich everything after the slowest provider settles.
    const enrichedByProvider = new Map<string, NormalizedFlightOffer[]>();

    // Run provider searches in parallel with per-provider timeout.
    // Each provider emits supplier_results via SSE as soon as it settles,
    // so the frontend can show results progressively.
    const providerSearches = providers.map(async (provider) => {
      const startTime = Date.now();
      if (searchId && this.searchJobService) {
        await this.searchJobService.reportSupplierStarted(searchId, provider.key, 'searching');
      }
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Provider search timed out')), this.providerTimeoutMs);
        });
        const searchPromise = provider.searchFlights(input);
        const raw = await Promise.race([searchPromise, timeoutPromise]);

        const elapsedMs = Date.now() - startTime;
        const offers = Array.isArray(raw?.offers) ? raw.offers : [];
        if (process.env.ENABLE_SEARCH_RESULT_LOGS === 'true') {
          this.logger.debug(`[AGGREGATOR] ${provider.key} search completed in ${elapsedMs}ms with ${offers.length} offers`);
        }

        if (searchId && this.searchJobService) {
          await this.searchJobService.reportSupplierCompleted(searchId, provider.key, offers.length, elapsedMs);
          // Emit per-supplier results for progressive listing
          const taggedOffers = offers.map((offer) => ({
            ...offer,
            provider: offer.provider || provider.key,
          }));
          await this.searchJobService.reportSupplierResults(searchId, provider.key, taggedOffers);

          // Emit enriched display-ready chunk for progressive rendering.
          // Awaiting the patch here means provider completion (and therefore
          // search completion) already includes enrichment — overlapped across
          // providers instead of serialized afterwards.
          const enriched = await this.emitProgressiveReadyChunk(searchId, provider.key, searchKey, taggedOffers, raw, input, agentProfileId);
          if (enriched) enrichedByProvider.set(provider.key, enriched);
        }

        return {
          provider: provider.key,
          status: 'ok' as const,
          raw,
          offers,
          elapsedMs,
        };
      } catch (error: any) {
        const elapsedMs = Date.now() - startTime;
        this.logger.warn(`[AGGREGATOR] ${provider.key} search failed after ${elapsedMs}ms: ${error?.message ?? error}`);

        if (searchId && this.searchJobService) {
          const code = error?.message?.includes('timed out') ? 'TIMEOUT' : 'FAILED';
          await this.searchJobService.reportSupplierFailed(searchId, provider.key, code, elapsedMs);
        }

        return {
          provider: provider.key,
          status: 'failed' as const,
          errorCode: error?.code ?? 'PROVIDER_SEARCH_FAILED',
          errorMessage: error?.message ?? 'Provider search failed',
          offers: [],
          elapsedMs,
        };
      }
    });

    const results = await Promise.allSettled(providerSearches);

    // Collect results and warnings
    const allOffers: NormalizedFlightOffer[] = [];
    const providerResults: Record<string, ProviderSearchResult> = {};
    const warnings: string[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const value = result.value;
        providerResults[value.provider] = {
          provider: value.provider,
          status: value.status,
          errorCode: value.errorCode,
          errorMessage: value.errorMessage,
          offerCount: value.offers.length,
          elapsedMs: value.elapsedMs,
        };

        if (value.status === 'ok') {
          // Prefer the enriched offers from the progressive patch pipeline
          // (airline/airport names, logos, currency) — falls back to raw.
          const enriched = enrichedByProvider.get(value.provider);
          const taggedOffers = (enriched ?? value.offers).map((offer) => ({
            ...offer,
            provider: offer.provider || value.provider,
          }));
          allOffers.push(...taggedOffers);
        } else {
          warnings.push(`Provider "${value.provider}" search failed: ${value.errorMessage}. Results may be incomplete.`);
        }
      } else {
        warnings.push('An internal error occurred during provider search.');
      }
    }

    // Per-provider metadata for meta
    const providerMeta: Record<string, unknown> = {};
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.status === 'ok') {
        providerMeta[result.value.provider] = {
          offerCount: result.value.offers.length,
          elapsedMs: result.value.elapsedMs,
        };
      }
    }

    // Propagate provider-specific search metadata (catalogUuid, providerContexts, referenceList)
    // from raw provider responses into the aggregated meta so downstream code
    // (mapper, selected-offer cache, reprice, booking) can access them.
    let catalogUuid = '';
    let providerContexts: Record<string, unknown> = {};
    let referenceList: Record<string, unknown> | undefined;
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.status === 'ok' && result.value.raw?.meta) {
        const rawMeta = result.value.raw.meta;
        // Prefer the last provider's catalogUuid (Travelport typically sets this)
        if (rawMeta.catalogUuid) {
          catalogUuid = rawMeta.catalogUuid;
        }
        // Merge providerContexts (NDC/GDS context from Travelport parallel search)
        if (rawMeta.providerContexts) {
          providerContexts = { ...providerContexts, ...rawMeta.providerContexts };
        }
        // Preserve referenceList from GDS provider
        if (rawMeta.referenceList && !referenceList) {
          referenceList = rawMeta.referenceList;
        }
      }
    }

    if (allOffers.length === 0 && warnings.length === 0) {
      warnings.push('No flights found matching your search criteria.');
    }

    // ponytail: markup not applied here — FlightResponseMapper.toSearchView() handles it.
    // Applying it here would cause double-markup.

    // Build offer-to-provider map for downstream provider detection
    const offerProviderMap: Record<string, string> = {};
    for (const offer of allOffers) {
      const key = offer.metadata?.offeringId ?? offer.id;
      if (key) offerProviderMap[key] = offer.provider;
    }

    // Cache compact search session
    const session: FlightSearchSession = {
      searchKey,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      criteria: input,
      providers: providerResults,
    };
    await this.cacheService.set(`flight-search:${searchKey}`, session, SEARCH_SESSION_TTL_SECONDS);

    // Cache per-provider raw responses so downstream Travelport-specific code
    // (selected-offer cache, reference list data) can still find them.
    // Also cache lightweight offer-to-provider map for provider detection.
    const cachingTasks: Promise<void>[] = [
      this.cacheService.set(`flight-search-provider-map:${searchKey}`, offerProviderMap, SEARCH_SESSION_TTL_SECONDS),
    ];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.status === 'ok' && result.value.raw) {
        cachingTasks.push(
          this.cacheService.set(
            `flight-search:${searchKey}:provider:${result.value.provider}`,
            result.value.raw,
            SEARCH_SESSION_TTL_SECONDS,
          ),
        );
      }
    }
    await Promise.allSettled(cachingTasks);

    // Phase 14: Prime selected-offer cache for every offer so that
    // FlightOfferSnapshotService can retrieve them when the user clicks Select.
    // Must complete BEFORE the search response returns — otherwise cards appear
    // but Select fails because the cache entry doesn't exist yet.
    if (this.selectedOfferCache && allOffers.length > 0) {
      const rawByProvider = new Map<string, NormalizedFlightSearchResponse>();
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.status === 'ok' && result.value.raw) {
          rawByProvider.set(result.value.provider, result.value.raw);
        }
      }
      const offersCopy = [...allOffers];
      await this.primeSelectedOfferCache(offersCopy, searchKey, rawByProvider, input);
    }

    if (process.env.ENABLE_SEARCH_RESULT_LOGS === 'true') {
      this.logger.log(
        `[AGGREGATOR] Search ${searchKey}: ${Object.keys(providerResults).length}/${providers.length} providers succeeded, ${allOffers.length} offers returned`,
      );
    }

    if (input.tripType === 'multi_city') {
      this.logger.log(
        `[MULTI-CITY] Aggregator result — ${allOffers.length} total offers from ${Object.keys(providerResults).length} providers, legs: ${input.legs?.length ?? 0}`,
      );
    }

    return {
      searchKey,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      warnings,
      offers: allOffers,
      providerResults: Object.values(providerResults),
      meta: {
        providerResults: Object.values(providerResults),
        providerMeta,
        catalogUuid,
        ...(providerContexts ? { providerContexts } : {}),
        ...(referenceList ? { referenceList } : {}),
      },
    };
  }

  /**
   * Resolve the correct catalogUuid + referenceList for one offer's cache
   * entry. Travelport's own merged NDC+GDS response always spreads NDC's
   * meta last onto the shared top-level keys (see travelport.service.ts), so
   * rawMeta.referenceList is NDC's even for a GDS offer. When NDC found zero
   * offers, its reference-list builders return `undefined` per section — an
   * object that's still "present" but structurally empty, which
   * JSON-serializes to `{}` on cache write and fails the booking-context
   * completeness check for every trip type (one-way, round-trip, multi-city
   * alike). Prefer this offer's own content-source context
   * (rawMeta.providerContexts[NDC|GDS]) instead, validating structure rather
   * than mere presence.
   */
  private resolveOfferSupplierContext(
    offer: NormalizedFlightOffer,
    rawMeta: Record<string, any> | undefined,
  ): { catalogUuid: string; referenceList: SelectedOfferCacheEntry['referenceList'] } {
    const offerContentSource = (offer as any).contentSource as string | undefined;
    const providerCtx =
      offerContentSource && rawMeta?.providerContexts
        ? rawMeta.providerContexts[offerContentSource]
        : undefined;
    const isValidRefList = (rl: unknown): boolean =>
      !!rl &&
      typeof (rl as any).products === 'object' &&
      typeof (rl as any).flights === 'object';
    const candidateRefList = providerCtx?.referenceList;
    const chosenRefList = isValidRefList(candidateRefList)
      ? candidateRefList
      : isValidRefList(rawMeta?.referenceList)
        ? rawMeta!.referenceList
        : { products: {}, flights: {} };
    // Deep-clone: this object is shared across every offer's cache entry
    // (same rawMeta.providerContexts reference for the whole search), and
    // the in-memory cache store keeps entries by reference rather than by
    // value. Handing out the same live object let something downstream
    // mutate/clear one offer's referenceList and have it show up empty for
    // every other offer (and this one, on retrieval) too.
    const referenceList: SelectedOfferCacheEntry['referenceList'] = JSON.parse(
      JSON.stringify(chosenRefList),
    );
    return {
      catalogUuid: providerCtx?.catalogUuid ?? rawMeta?.catalogUuid ?? '',
      referenceList,
    };
  }

  /**
   * Phase 14: Write selected-offer cache entries for every final search result offer.
   * Must complete before search response is returned to frontend.
   */
  private async primeSelectedOfferCache(
    allOffers: NormalizedFlightOffer[],
    searchKey: string,
    rawByProvider: Map<string, NormalizedFlightSearchResponse>,
    criteria: FlightSearchDto,
  ) {
    const tasks = allOffers.map(async (offer) => {
      const provider = offer.provider;
      const offerKey = offer.metadata?.offeringId ?? offer.id;
      if (!provider || !offerKey) return;

      const raw = rawByProvider.get(provider);
      const rawMeta = raw?.meta as Record<string, any> | undefined;
      const { catalogUuid, referenceList } = this.resolveOfferSupplierContext(offer, rawMeta);

      // Build productSelections from metadata (handles round-trip combined offers correctly).
      // The normalizer reliably sets metadata.productRefs but doesn't always
      // also derive metadata.productSelections (seen on simple/single-product
      // GDS offers) — without this fallback, this entry (which primes the
      // cache during search, before any preview/ancillary call) bakes in an
      // empty productSelections permanently: it wins the `existing` cache-hit
      // check downstream, so every ancillary call (seat map, baggage, meals)
      // fails with "insufficient data" for that offer.
      const productSelections = offer.metadata?.productSelections?.length
        ? offer.metadata.productSelections
        : offer.metadata?.productRefs?.length
          ? [
              {
                offeringId:
                  offer.metadata?.catalogOfferingId ??
                  offer.metadata?.offeringId ??
                  offer.id,
                productIds: offer.metadata.productRefs,
              },
            ]
          : [];
      const offeringIds = productSelections.length
        ? productSelections.map((s: any) => s.offeringId)
        : (offer.metadata?.offeringId ? [offer.metadata.offeringId] : []);
      const productRefs = productSelections.length
        ? productSelections.flatMap((s: any) => s.productIds)
        : (offer.metadata?.productRefs ?? []);

      const entry: SelectedOfferCacheEntry = {
        catalogUuid,
        offeringIds,
        productRefs,
        productSelections,
        brandOfferingId: offer.metadata?.brandOfferingId,
        combinabilityCode: offer.metadata?.combinabilityCode,
        contentSource: (offer as any).contentSource,
        supplierPrice: offer.price?.total != null
          ? { amount: offer.price.total, currency: offer.price.currency ?? 'USD' }
          : undefined,
        // The user's requested display currency — was never actually set at
        // this write site despite being declared on SelectedOfferCacheEntry,
        // leaving every downstream reader of `.currency` (e.g. snapshot
        // creation's policy-currency conversion) unable to tell what
        // currency to convert INTO and forced to guess from offer fields
        // that are sometimes still in the supplier's native currency.
        currency: criteria.currency ?? 'USD',
        referenceList,
        passengerCriteria: [{ number: criteria.adults ?? 1, passengerTypeCode: 'ADT' }],
        searchCriteria: {
          from: criteria.from,
          to: criteria.to,
          departureDate: criteria.departureDate,
          tripType: criteria.tripType,
          returnDate: criteria.returnDate,
          cabinClass: criteria.cabinClass,
          adults: criteria.adults ?? 1,
          ...(criteria.tripType === 'multi_city' && criteria.legs
            ? { legs: criteria.legs.map((l: any) => ({ origin: l.origin, destination: l.destination, departureDate: l.departureDate })) }
            : {}),
        },
        // For Duffel: store the raw provider offer so buildSupplierContext gets real slices/passengers.
        // Falls back to the normalized offer (which has segments, not slices).
        rawOffer: provider === 'duffel'
          ? (raw?.offers?.find((ro: any) => ro.id === offer.id) ?? offer)
          : undefined,
        travelportPlusSessionId: rawMeta?.travelportPlusSessionId,
      };

      await this.selectedOfferCache!.store(provider, searchKey, offerKey, entry, SEARCH_SESSION_TTL_SECONDS);
      if (process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true') {
        this.logger.debug(
          `[SelectedOfferCache] stored provider=${provider} searchKey=${searchKey} offerId=${offerKey} productSelections=${productSelections.length} slices=${provider === 'duffel' ? (entry.rawOffer as any)?.slices?.length ?? 0 : 0}`);
      }
    });

    const results = await Promise.allSettled(tasks);
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      this.logger.warn(`[AGGREGATOR] ${failed}/${allOffers.length} selected-offer cache writes failed`);
    }
  }

  /**
   * Chunk an array into sub-arrays of given sizes.
   * e.g. chunkOffers([a,b,c,d,e], [2, 2]) => [[a,b], [c,d], [e]]
   */
  private chunkOffers<T>(items: T[], chunkSizes: number[]): T[][] {
    const chunks: T[][] = [];
    let offset = 0;
    for (const size of chunkSizes) {
      if (offset >= items.length) break;
      chunks.push(items.slice(offset, offset + size));
      offset += size;
    }
    if (offset < items.length) {
      chunks.push(items.slice(offset));
    }
    return chunks;
  }

  /**
   * Fast-first progressive chunk pipeline.
   *
   * For each chunk:
   *   1. Cache selected-offer context (ensures clickability)
   *   2. Fast-map to FlightOfferView (zero DB, zero enrichment, zero currency)
   *   3. Emit supplier_results_ready immediately
   *
   * After all fast chunks are emitted, enrich asynchronously and patch.
   *
   * Cancellation-safe: checks isCancelled before each emission.
   */
  private async emitProgressiveReadyChunk(
    searchId: string,
    providerKey: string,
    searchKey: string,
    taggedOffers: NormalizedFlightOffer[],
    raw: NormalizedFlightSearchResponse,
    input: FlightSearchDto,
    agentProfileId?: string,
  ): Promise<NormalizedFlightOffer[] | null> {
    if (!this.mapper || !this.selectedOfferCache) return null;
    if (taggedOffers.length === 0) return null;

    const rawByProvider = new Map<string, NormalizedFlightSearchResponse>();
    rawByProvider.set(providerKey, raw);

    const chunks = this.chunkOffers(taggedOffers, [20, 50]);

    // ── Phase 1: Fast emit — cache + fast-map + emit per chunk ──
    for (const chunk of chunks) {
      const job = await this.searchJobService?.getJob(searchId);
      if (!job || job.lifecycle === 'cancelled') return null;

      // Prime selected-offer cache for this chunk
      const cachedOfferIds = await this.primeSelectedOfferCacheForOffers(
        chunk,
        searchKey,
        rawByProvider,
        input,
      );

      // Fast map (cached decimals lookup only, zero enrichment, zero currency conversion)
      const fastView = await this.mapper.toFastSearchView({
        offers: chunk,
        warnings: [],
        meta: {
          searchKey,
          catalogUuid: (raw?.meta as any)?.catalogUuid ?? '',
          ...(raw?.meta ?? {}),
        },
      });

      // Only emit offers whose cache write succeeded
      const clickableOffers = fastView.offers.filter((o) => cachedOfferIds.has(o.offerId));
      if (clickableOffers.length === 0) continue;

      await this.searchJobService!.reportSupplierResultsReady(
        searchId,
        providerKey,
        searchKey,
        clickableOffers,
        'append',
      );
    }

    // ── Phase 2: Enrichment patch (awaited — result feeds the final response) ──
    if (!this.enrichmentService) return null;
    try {
      return await this.emitEnrichedPatch(searchId, providerKey, searchKey, taggedOffers, raw, input, agentProfileId);
    } catch (err) {
      this.logger.warn(
        `[AGGREGATOR] Enrichment patch failed for ${providerKey}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /**
   * Async enrichment patch: enriches previously emitted fast cards with
   * airline/airport names, logos, currency breakdown, and markup.
   * Emits supplier_results_enriched events by chunk so the frontend can
   * patch cards in-place without remounting the list.
   */
  private async emitEnrichedPatch(
    searchId: string,
    providerKey: string,
    searchKey: string,
    offers: NormalizedFlightOffer[],
    raw: NormalizedFlightSearchResponse,
    input: FlightSearchDto,
    agentProfileId?: string,
  ): Promise<NormalizedFlightOffer[] | null> {
    if (!this.enrichmentService || !this.mapper) return null;
    if (offers.length === 0) return null;

    const job = await this.searchJobService?.getJob(searchId);
    if (!job || job.lifecycle === 'cancelled') return null;

    const enrichedOffers = await this.enrichmentService.enrichOffers(offers);

    const viewResult = await this.mapper.toSearchView(
      {
        offers: enrichedOffers,
        warnings: [],
        meta: {
          searchKey,
          catalogUuid: (raw?.meta as any)?.catalogUuid ?? '',
          ...(raw?.meta ?? {}),
        },
      },
      undefined,
      input.currency,
      agentProfileId,
    );

    const chunks = this.chunkOffers(viewResult.offers, [20, 50]);
    for (const chunk of chunks) {
      const job = await this.searchJobService?.getJob(searchId);
      if (!job || job.lifecycle === 'cancelled') return null;

      await this.searchJobService!.reportSupplierResultsEnriched(
        searchId,
        providerKey,
        searchKey,
        chunk,
      );
    }

    return enrichedOffers;
  }

  /**
   * Prime selected-offer cache for a specific subset of offers (per-provider).
   * Returns the set of offer IDs that were successfully cached.
   */
  private async primeSelectedOfferCacheForOffers(
    offers: NormalizedFlightOffer[],
    searchKey: string,
    rawByProvider: Map<string, NormalizedFlightSearchResponse>,
    criteria: FlightSearchDto,
  ): Promise<Set<string>> {
    if (!this.selectedOfferCache) return new Set(offers.map((o) => o.metadata?.offeringId ?? o.id).filter(Boolean));

    const cachedKeys = new Set<string>();
    const tasks = offers.map(async (offer) => {
      const provider = offer.provider;
      const offerKey = offer.metadata?.offeringId ?? offer.id;
      if (!provider || !offerKey) return;

      const raw = rawByProvider.get(provider);
      const rawMeta = raw?.meta as Record<string, any> | undefined;
      const { catalogUuid, referenceList } = this.resolveOfferSupplierContext(offer, rawMeta);

      // See primeSelectedOfferCache's comment above — same productRefs
      // fallback, needed for the same reason.
      const productSelections = offer.metadata?.productSelections?.length
        ? offer.metadata.productSelections
        : offer.metadata?.productRefs?.length
          ? [
              {
                offeringId:
                  offer.metadata?.catalogOfferingId ??
                  offer.metadata?.offeringId ??
                  offer.id,
                productIds: offer.metadata.productRefs,
              },
            ]
          : [];
      const offeringIds = productSelections.length
        ? productSelections.map((s: any) => s.offeringId)
        : (offer.metadata?.offeringId ? [offer.metadata.offeringId] : []);
      const productRefs = productSelections.length
        ? productSelections.flatMap((s: any) => s.productIds)
        : (offer.metadata?.productRefs ?? []);

      const entry: SelectedOfferCacheEntry = {
        catalogUuid,
        offeringIds,
        productRefs,
        productSelections,
        brandOfferingId: offer.metadata?.brandOfferingId,
        combinabilityCode: offer.metadata?.combinabilityCode,
        contentSource: (offer as any).contentSource,
        supplierPrice: offer.price?.total != null
          ? { amount: offer.price.total, currency: offer.price.currency ?? 'USD' }
          : undefined,
        // The user's requested display currency — was never actually set at
        // this write site despite being declared on SelectedOfferCacheEntry,
        // leaving every downstream reader of `.currency` (e.g. snapshot
        // creation's policy-currency conversion) unable to tell what
        // currency to convert INTO and forced to guess from offer fields
        // that are sometimes still in the supplier's native currency.
        currency: criteria.currency ?? 'USD',
        referenceList,
        passengerCriteria: [{ number: criteria.adults ?? 1, passengerTypeCode: 'ADT' }],
        searchCriteria: {
          from: criteria.from,
          to: criteria.to,
          departureDate: criteria.departureDate,
          tripType: criteria.tripType,
          returnDate: criteria.returnDate,
          cabinClass: criteria.cabinClass,
          adults: criteria.adults ?? 1,
          ...(criteria.tripType === 'multi_city' && criteria.legs
            ? { legs: criteria.legs.map((l: any) => ({ origin: l.origin, destination: l.destination, departureDate: l.departureDate })) }
            : {}),
        },
        rawOffer: provider === 'duffel'
          ? (raw?.offers?.find((ro: any) => ro.id === offer.id) ?? offer)
          : undefined,
        travelportPlusSessionId: rawMeta?.travelportPlusSessionId,
      };

      await this.selectedOfferCache!.store(provider, searchKey, offerKey, entry, SEARCH_SESSION_TTL_SECONDS);
      cachedKeys.add(offerKey);
    });

    await Promise.allSettled(tasks);
    return cachedKeys;
  }

  /**
   * Generate a unique search key prefixed with 'fs_' for easy identification.
   */
  private generateSearchKey(): string {
    return `fs_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
  }

  private emptyResponse(message: string): CombinedFlightSearchResponse {
    const now = new Date();
    return {
      searchKey: '',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SEARCH_SESSION_TTL_SECONDS * 1000).toISOString(),
      warnings: [message],
      offers: [],
      providerResults: [],
    };
  }
}
