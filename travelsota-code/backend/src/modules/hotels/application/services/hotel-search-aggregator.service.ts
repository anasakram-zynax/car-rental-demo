import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { applySearchCardDietToList } from './search-card-diet';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { HotelsProviderRegistryService } from '../../providers/registry/hotels-provider-registry.service';
import { HotelGroupingService } from './hotel-grouping.service';
import { CacheService } from '../../../../shared/cache/cache.service';
import { MarkupService } from '../../../markup/markup.service';
import { CurrencyService } from '../../../currency/application/services/currency.service';
import { SearchJobService } from '../../../search-job/search-job.service';
import type {
  HotelSearchInput,
  NormalizedHotelSummary,
  CombinedHotelCard,
  CombinedHotelSearchResponse,
  ProviderSearchResult,
  ProviderWarning,
  HotelSearchSession,
} from '../../domain/types/hotel-provider.types';

const SEARCH_SESSION_TTL_SECONDS = 900; // 15 minutes
const DEFAULT_PROVIDER_TIMEOUT_MS = 35000; // 35 seconds per provider (Amadeus needs 2 API calls)

/**
 * Orchestrates multi-provider hotel search.
 *
 * Phase 3 implementation:
 * 1. Loads all search-enabled providers from the registry
 * 2. Runs each provider search in parallel with per-provider timeout
 * 3. Normalizes results into combined hotel cards
 * 4. Adds warnings for partial failures
 * 5. Stores a compact search session by searchKey
 * 6. Also stores full raw results for HotelDetailsService backward compat
 * 7. Returns combined results
 */
@Injectable()
export class HotelSearchAggregatorService {
  private readonly logger = new Logger(HotelSearchAggregatorService.name);
  private providerTimeoutMs: number;

  constructor(
    private readonly providerRegistry: HotelsProviderRegistryService,
    private readonly groupingService: HotelGroupingService,
    private readonly cacheService: CacheService,
    private readonly markupService: MarkupService,
    private readonly currencyService: CurrencyService,
    private readonly searchJobService?: SearchJobService,
    @Optional() private readonly prisma?: PrismaService,
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
   * Admin control surface: restrict search to the agent's allowed hotel
   * suppliers (null/empty = all). Skipped providers report completed-empty
   * on SSE jobs so the frontend never waits on them.
   */
  private async filterProvidersForAgent<T extends { key: string }>(
    providers: T[],
    agentProfileId: string | null | undefined,
    searchId?: string,
  ): Promise<T[]> {
    if (!agentProfileId || !this.prisma) return providers;
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { allowedHotelProviders: true },
    }).catch(() => null);
    const allowed = (profile?.allowedHotelProviders as string[] | null) ?? [];
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
    const LABELS: Record<string, string> = { hotelbeds: 'Hotelbeds', ratehawk: 'RateHawk', amadeus: 'Amadeus', manual: 'Manual Hotels' };
    return providers.map((p) => ({ key: p.key, label: LABELS[p.key] ?? p.key }));
  }

  /**
   * Run a combined search across all search-enabled providers.
   * Returns results even if some providers fail — partial results + warnings.
   * When searchId is provided, emits real-time events via SearchJobService.
   */
  async aggregateSearch(
    input: HotelSearchInput,
    searchId?: string,
    pricingCtx?: { agentProfileId?: string | null; agentProfileFallback?: number },
  ): Promise<CombinedHotelSearchResponse> {
    console.log(`[AGGREGATOR] SEARCH START — dc="${input.destinationCode ?? 'NONE'}" geo=${input.geolocation ? `${input.geolocation.latitude},${input.geolocation.longitude} r${input.geolocation.radius}km` : 'NONE'} codes=${input.hotelCodes?.length ?? 0} name="${input.destinationName ?? ''}" hotelName="${input.hotelName ?? ''}" checkIn=${input.checkIn} checkOut=${input.checkOut}`);

    // Sanitize: strip gn-* destination codes — they're GeoNames IDs that suppliers
    // can't resolve. When geolocation is available, providers should use it instead.
    const sanitizedInput: HotelSearchInput = { ...input };
    if (sanitizedInput.destinationCode?.startsWith('gn-')) {
      this.logger.debug(
        `Stripping gn-* destinationCode "${sanitizedInput.destinationCode}" — using geolocation fallback`,
      );
      delete sanitizedInput.destinationCode;
    }

    const providers = await Promise.race([
      this.providerRegistry.getSearchProviders(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Provider discovery timed out — database may be unreachable')), 5000),
      ),
    ]).then((list) => this.filterProvidersForAgent(list, pricingCtx?.agentProfileId, searchId));

    if (searchId && this.searchJobService && providers.length === 0) {
      await this.searchJobService.failJob(searchId, 'ALL_SUPPLIERS_FAILED');
      return this.emptyResponse('No hotel search providers are enabled. Please enable at least one provider in admin settings.');
    }

    if (providers.length === 0) {
      return this.emptyResponse('No hotel search providers are enabled. Please enable at least one provider in admin settings.');
    }

    const searchKey = this.generateSearchKey();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SEARCH_SESSION_TTL_SECONDS * 1000);

    // Run provider searches in parallel with per-provider timeout.
    // Each provider emits supplier_results via SSE as soon as it settles,
    // so the frontend can show results progressively (before grouping).
    const providerSearches = providers.map(async (provider) => {
      const startTime = Date.now();
      console.log(`[AGGREGATOR] ${provider.key}: search starting — dc=${sanitizedInput.destinationCode ?? 'NONE'} geo=${sanitizedInput.geolocation ? 'YES' : 'NONE'}`);

      if (searchId && this.searchJobService) {
        await this.searchJobService.reportSupplierStarted(searchId, provider.key, 'searching');
      }
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Provider search timed out')), this.providerTimeoutMs);
        });
        const searchPromise = provider.search(sanitizedInput);
        const raw = await Promise.race([searchPromise, timeoutPromise]);

        const elapsedMs = Date.now() - startTime;
        const hotelCount = raw.hotels?.length ?? 0;
        console.log(`[AGGREGATOR] ${provider.key}: search OK ${hotelCount} hotels in ${elapsedMs}ms`);

        if (searchId && this.searchJobService) {
          await this.searchJobService.reportSupplierCompleted(searchId, provider.key, hotelCount, elapsedMs);
          // Emit raw per-provider hotels for progressive listing (legacy compat)
          const hotels = Array.isArray(raw?.hotels) ? raw.hotels : [];
          await this.searchJobService.reportSupplierResults(searchId, provider.key, hotels);

          // Emit enriched display-ready hotel cards for this provider.
          // Timeout-guarded: a hang here must not block provider completion.
          try {
            await this.withTimeout(
              this.emitProgressiveHotelChunk(searchId, provider.key, searchKey, raw, sanitizedInput, pricingCtx),
              20_000,
              `progressive emit (${provider.key})`,
            );
          } catch (emitErr) {
            this.logger.warn(
              `[AGGREGATOR] ${provider.key}: progressive emit skipped — ${emitErr instanceof Error ? emitErr.message : emitErr}`,
            );
          }
        }

        return {
          provider: provider.key,
          status: 'ok' as const,
          raw,
          elapsedMs,
        };
      } catch (error: any) {
        const elapsedMs = Date.now() - startTime;

        // WS5: a provider missing a per-destination config (e.g. RateHawk
        // region_id for an unmapped city) is a SKIP, not a failure — the
        // search continues with the remaining suppliers without scaring
        // users with a partial-results banner.
        if (error?.code === 'RATEHAWK_REGION_ID_REQUIRED') {
          console.warn(`[AGGREGATOR] ${provider.key}: SKIPPED ${elapsedMs}ms — no region mapping for destination`);
          if (searchId && this.searchJobService) {
            await this.searchJobService.reportSupplierCompleted(searchId, provider.key, 0, elapsedMs);
          }
          return {
            provider: provider.key,
            status: 'skipped' as const,
            errorCode: error.code,
            errorMessage: error.message,
            raw: null,
            elapsedMs,
          };
        }

        console.error(`[AGGREGATOR] ${provider.key}: search FAILED ${elapsedMs}ms — ${error?.message ?? error}`, error?.stack?.slice(0, 300));

        if (searchId && this.searchJobService) {
          const code = error?.message?.includes('timed out') ? 'TIMEOUT' : 'FAILED';
          await this.searchJobService.reportSupplierFailed(searchId, provider.key, code, elapsedMs);
        }

        return {
          provider: provider.key,
          status: 'failed' as const,
          errorCode: error?.code ?? 'PROVIDER_SEARCH_FAILED',
          errorMessage: error?.message ?? 'Provider search failed',
          raw: null,
          elapsedMs,
        };
      }
    });

    const results = await Promise.allSettled(providerSearches);

    // Collect results and warnings
    const successfulResults: Array<{ provider: string; raw: any }> = [];
    const providerResults: Record<string, ProviderSearchResult> = {};
    const warnings: ProviderWarning[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const value = result.value;
        providerResults[value.provider] = {
          provider: value.provider,
          status: value.status,
          errorCode: value.errorCode,
          errorMessage: value.errorMessage,
          hotelCount: value.raw?.hotels?.length ?? 0,
          elapsedMs: value.elapsedMs,
        };

        if (value.status === 'ok' && value.raw) {
          successfulResults.push({ provider: value.provider, raw: value.raw });
        } else {
          warnings.push({
            provider: value.provider,
            code: value.errorCode ?? 'PROVIDER_SEARCH_FAILED',
            message: value.errorMessage ?? `Provider "${value.provider}" search failed. Results may be incomplete.`,
          });
        }
      } else {
        warnings.push({
          provider: null,
          code: 'PROVIDER_INTERNAL_ERROR',
          message: 'An internal error occurred during provider search.',
        });
      }
    }

    // ── Cache the merged provider results IMMEDIATELY ──
    // The frontend shows progressive cards while grouping/enrichment/markup
    // still run. HotelDetailsService.getDetails() reads these keys on card
    // click — if we wait until the end of the pipeline, a user clicking a
    // card mid-pipeline hits an empty cache ("search results have expired").
    const session: HotelSearchSession = {
      searchKey,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      criteria: input as unknown as Record<string, unknown>,
      providers: providerResults,
    };
    await this.cacheService.set(`search:${searchKey}`, session, SEARCH_SESSION_TTL_SECONDS);

    // Also store merged provider search results under the searchKey for
    // HotelDetailsService backward compat. Merges all successful provider
    // results into a single NormalizedHotelSearchResponse-shaped object that
    // HotelDetailsService.getDetails() expects.
    const mergedHotels: NormalizedHotelSummary[] = [];
    for (const sr of successfulResults) {
      const providerHotels: NormalizedHotelSummary[] = Array.isArray(sr.raw?.hotels) ? sr.raw.hotels : [];
      for (const h of providerHotels) {
        // Prefix hotelId with provider to avoid collisions when multiple providers
        // return different hotels with the same internal ID
        mergedHotels.push({
          ...h,
          hotelId: `${sr.provider}:${h.providerHotelId ?? h.hotelId}`,
        });
      }
    }
    await this.cacheService.set(
      searchKey,
      {
        provider: providers.map((p) => p.key).join(','),
        hotels: mergedHotels,
        meta: {
          total: mergedHotels.length,
          checkIn: (input as any).checkIn,
          checkOut: (input as any).checkOut,
        },
      },
      SEARCH_SESSION_TTL_SECONDS,
    );
    this.logger.log(
      `[AGGREGATOR] Stored merged search cache under key="${searchKey}" (${mergedHotels.length} hotels)`,
    );

    // Build combined hotel cards using the grouping service.
    // Per-provider cards: each supplier's hotel is its own card with only
    // that supplier's data (product decision — agents compare per-supplier).
    let combinedHotels: CombinedHotelCard[] = await this.withTimeout(
      this.groupingService.groupHotels(successfulResults, 'per_provider'),
      15_000,
      'hotel grouping',
    );

    // Static-content search-card enrichment is out of scope for this
    // manual-only starter kit — cards are returned as grouped, unenriched.

    // Post-filter by hotelName / destinationName when present.
    // Provider-level filtering only works for Hotelbeds; RateHawk silently
    // ignores hotelName. Centralising the filter here ensures consistent
    // behaviour across all providers and supports geo-only searches where
    // destinationCode is absent.
    //
    // Skip destinationName filtering when geolocation is present — the geo
    // search already scoped results spatially, and destinationName (e.g.
    // "Dubai Marina") rarely matches the hotel's city field exactly (e.g.
    // "Dubai"), causing false negatives.
    if (input.hotelName || (input.destinationName && !input.geolocation)) {
      const beforeCount = combinedHotels.length;
      combinedHotels = combinedHotels.filter((card) => {
        if (input.hotelName) {
          const needle = input.hotelName.toLowerCase();
          if (!card.displayName.toLowerCase().includes(needle)) return false;
        }
        if (input.destinationName) {
          const needle = input.destinationName.toLowerCase();
          const city = card.location?.city?.toLowerCase() ?? '';
          const country = card.location?.country?.toLowerCase() ?? '';
          if (!city.includes(needle) && !country.includes(needle)) return false;
        }
        return true;
      });
      if (combinedHotels.length < beforeCount && process.env.ENABLE_SEARCH_RESULT_LOGS === 'true') {
        this.logger.debug(
          `[AGGREGATOR] Search ${searchKey}: post-filter reduced ${beforeCount} → ${combinedHotels.length} hotels (hotelName="${input.hotelName}", destinationName="${input.destinationName}")`,
        );
      }
    } else if (input.destinationName && input.geolocation && process.env.ENABLE_SEARCH_RESULT_LOGS === 'true') {
      this.logger.debug(
        `[AGGREGATOR] Search ${searchKey}: skipping destinationName post-filter (geo search already scoped results)`,
      );
    }

    // Apply customer markup to each hotel's minRate totals for search display
    // Pre-load all active hotel markup rules ONCE, then filter in memory per hotel
    // Unified pipeline Phase 2: when the job owner is an agent, resolve their
    // profile fallback ONCE and price cards with agent rules instead.
    const agentProfileId = pricingCtx?.agentProfileId ?? null;
    const agentProfileFallback = agentProfileId
      ? await this.withTimeout(
          this.markupService.getProfileMarkupFallback(agentProfileId, 'hotels', 0),
          10_000,
          'agent markup fallback',
        )
      : 0;
    try {
      const preloadedRules = await this.withTimeout(
        this.markupService.preloadRules('hotels'),
        10_000,
        'markup preload',
      );

      combinedHotels = await this.withTimeout(
        Promise.all(
          combinedHotels.map(async (card) => {
          const originalMinAmount = card.minPrice?.amount;

          const markedProviders = card.providers.map((p) => {
            if (!p.minRate) return p;
            const result = this.markupService.calculatePriceWithRulesForAgent(
              p.minRate.total,
              preloadedRules,
              agentProfileId,
              agentProfileFallback,
              p.provider,
            );
            const supplierPrice = result.basePrice;
            return {
              ...p,
              minRate: {
                ...p.minRate,
                total: result.finalPrice,
                supplierPrice,
                markupPercent: result.effectiveMarkupPercent,
              },
            };
          });
          const allPrices = markedProviders
            .map((p) => p.minRate?.total)
            .filter((p): p is number => p != null);
          const minAmount = allPrices.length > 0 ? Math.min(...allPrices) : card.minPrice?.amount;

          // Find supplier price corresponding to the cheapest marked-up provider
          let cardSupplierPrice: number | undefined;
          let cardMarkupPercent: number | undefined;
          if (originalMinAmount != null && minAmount != null && minAmount !== originalMinAmount) {
            const cheapestProvider = markedProviders.find((p) => p.minRate?.total === minAmount);
            cardSupplierPrice = cheapestProvider?.minRate?.supplierPrice ?? originalMinAmount;
            cardMarkupPercent = cheapestProvider?.minRate?.markupPercent;
          }

          // Display-currency base + markup for the card breakdown — converted
          // here so supplier/markup/total share ONE currency at render time.
          const displayCcy = input.currency?.toUpperCase();
          let cardBaseInDisplay: number | undefined;
          let cardMarkupInDisplay: number | undefined;
          if (displayCcy && minAmount != null && cardSupplierPrice != null) {
            try {
              const baseBd = await this.currencyService.buildPricingBreakdown({
                supplierAmount: cardSupplierPrice,
                supplierCurrency: card.minPrice?.currency ?? 'USD',
                displayCurrency: displayCcy,
              });
              cardBaseInDisplay = baseBd.displayPrice?.amount;
              if (baseBd.displayPrice && minAmount != null) {
                cardMarkupInDisplay = Math.max(0, minAmount - (baseBd.displayPrice.amount ?? 0));
              }
            } catch {
              // Conversion unavailable — frontend falls back to percent-only chip
            }
          }

          return {
            ...card,
            providers: markedProviders,
            minPrice: card.minPrice
              ? {
                  ...card.minPrice,
                  amount: minAmount!,
                  supplierPrice: cardSupplierPrice,
                  markupPercent: cardMarkupPercent,
                  supplierBaseInDisplay: cardBaseInDisplay,
                  markupInDisplay: cardMarkupInDisplay,
                }
              : undefined,
          };
          }),
        ),
        30_000,
        'markup application',
      );
    } catch (error) {
      this.logger.warn(`[AGGREGATOR] Markup application failed (non-blocking): ${error}`);
    }

    // Build pricing blocks (Phase 4) — backend-computed display/charge prices
    const displayCurrency = input.currency?.toUpperCase();
    if (displayCurrency) {
      try {
        combinedHotels = await this.withTimeout(
          Promise.all(
            combinedHotels.map(async (card) => {
              const supplierAmount = card.minPrice?.amount;
              const supplierCurrency = card.minPrice?.currency;
              if (supplierAmount == null || !supplierCurrency) return card;

              try {
                const breakdown = await this.currencyService.buildPricingBreakdown({
                  supplierAmount,
                  supplierCurrency,
                  displayCurrency,
                });
                return {
                  ...card,
                  pricing: {
                    supplierPrice: breakdown.supplierPrice,
                    displayPrice: breakdown.displayPrice,
                    chargePrice: breakdown.chargePrice,
                    ...(breakdown.exchangeRateSnapshot ? { exchangeRateSnapshot: breakdown.exchangeRateSnapshot } : {}),
                  },
                };
              } catch (err) {
                this.logger.warn(`[AGGREGATOR] Pricing breakdown failed for hotel ${card.hotelGroupId}: ${err instanceof Error ? err.message : String(err)}`);
                return card;
              }
            }),
          ),
          30_000,
          'pricing breakdown',
        );
      } catch (error) {
        this.logger.warn(`[AGGREGATOR] Pricing breakdown batch failed (non-blocking): ${error}`);
      }
    }

    if (combinedHotels.length === 0 && warnings.length === 0) {
      warnings.push({
        provider: null,
        code: 'NO_RESULTS',
        message: 'No hotels found matching your search criteria.',
      });
    }

    if (process.env.ENABLE_SEARCH_RESULT_LOGS === 'true') {
      this.logger.log(
        `[AGGREGATOR] Search ${searchKey}: ${successfulResults.length}/${providers.length} providers succeeded, ${combinedHotels.length} hotels returned`,
      );
    }

    // WS3: diet the search payload — cap images (≤2) and strip fields the
    // search card never renders. Cuts /result serialization + transfer time
    // (demo: 423KB → target <150KB). Details pages are unaffected.
    const dietedHotels = applySearchCardDietToList(combinedHotels);

    return {
      searchKey,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      warnings,
      hotels: dietedHotels,
      providerResults: Object.values(providerResults),
    };
  }

  /**
   * Race a promise against a timeout so a hung phase (DB lock, pool
   * starvation) degrades the search instead of stalling it forever.
   */
  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  /**
   * Emit a supplier_results_ready event with display-ready, grouped, enriched,
   * marked-up hotel cards for a single provider. The frontend consumes this
   * to render hotel cards progressively while the search is still running.
   * For each provider, we:
   * 1. Group that provider's hotels into individual CombinedHotelCard[] (single-provider grouping)
   * 2. Enrich with static content from local DB
   * 3. Apply markup rules
   * 4. Apply currency conversion
   * 5. Emit the enriched cards as a supplier_results_ready event
   *
   * Best-effort: failures are logged and skipped without blocking the search.
   */
  private async emitProgressiveHotelChunk(
    searchId: string,
    providerKey: string,
    searchKey: string,
    raw: any,
    input: HotelSearchInput,
    pricingCtx?: { agentProfileId?: string | null; agentProfileFallback?: number },
  ): Promise<void> {
    if (raw?.hotels?.length === 0) return;

    try {
      // Step 1: Group this provider's hotels into individual cards
      const providerHotels = Array.isArray(raw?.hotels) ? raw.hotels : [];
      if (providerHotels.length === 0) return;

      let cards = await this.groupingService.groupHotels(
        [{ provider: providerKey, raw }],
        'per_provider',
      );

      // Preload markup rules once for all chunks
      let preloadedRules: Awaited<ReturnType<MarkupService['preloadRules']>> | null = null;
      try {
        preloadedRules = await this.markupService.preloadRules('hotels');
      } catch (err) {
        this.logger.warn(`[AGGREGATOR] Progressive hotel markup preload failed for ${providerKey}: ${err}`);
      }

      // Chunked pipeline — first cards paint after ~25 hotels are ready instead
      // of waiting for the provider's entire inventory to enrich/convert.
      const chunkSizes: number[] = [];
      for (let i = 0; i < cards.length; i += i === 0 ? 25 : 60) chunkSizes.push(i === 0 ? 25 : 60);
      const chunks = this.chunkBySizes(cards, chunkSizes);

      for (const chunk of chunks) {
        const job = await this.searchJobService?.getJob(searchId);
        if (!job || job.lifecycle === 'cancelled') return;

        let readyCards = chunk;

        // Static-content enrichment (destination as city hint) is out of
        // scope for this manual-only starter kit — cards go straight to markup.

        // Step 3: Apply markup
        if (preloadedRules) {
          try {
            readyCards = await Promise.all(
              readyCards.map(async (card) => {
                const originalMinAmount = card.minPrice?.amount;
                const markedProviders = card.providers.map((p) => {
                  if (!p.minRate) return p;
                  const result = this.markupService.calculatePriceWithRulesForAgent(
                    p.minRate.total,
                    preloadedRules!,
                    pricingCtx?.agentProfileId ?? null,
                    pricingCtx?.agentProfileFallback ?? 0,
                    p.provider,
                  );
                  return {
                    ...p,
                    minRate: {
                      ...p.minRate,
                      total: result.finalPrice,
                      supplierPrice: result.basePrice,
                      markupPercent: result.effectiveMarkupPercent,
                    },
                  };
                });
                const allPrices = markedProviders
                  .map((p) => p.minRate?.total)
                  .filter((p): p is number => p != null);
                const minAmount = allPrices.length > 0 ? Math.min(...allPrices) : card.minPrice?.amount;

                let cardSupplierPrice: number | undefined;
                let cardMarkupPercent: number | undefined;
                if (originalMinAmount != null && minAmount != null && minAmount !== originalMinAmount) {
                  const cheapestProvider = markedProviders.find((p) => p.minRate?.total === minAmount);
                  cardSupplierPrice = cheapestProvider?.minRate?.supplierPrice ?? originalMinAmount;
                  cardMarkupPercent = cheapestProvider?.minRate?.markupPercent;
                }

                return {
                  ...card,
                  providers: markedProviders,
                  minPrice: card.minPrice
                    ? { ...card.minPrice, amount: minAmount!, supplierPrice: cardSupplierPrice, markupPercent: cardMarkupPercent }
                    : undefined,
                };
              }),
            );
          } catch (err) {
            this.logger.warn(`[AGGREGATOR] Progressive hotel markup failed for ${providerKey}: ${err}`);
          }
        }

        // Step 4: Apply currency conversion
        const displayCurrency = input.currency?.toUpperCase();
        if (displayCurrency) {
          try {
            readyCards = await Promise.all(
              readyCards.map(async (card) => {
                const supplierAmount = card.minPrice?.amount;
                const supplierCurrency = card.minPrice?.currency;
                if (supplierAmount == null || !supplierCurrency) return card;

                try {
                  const breakdown = await this.currencyService.buildPricingBreakdown({
                    supplierAmount,
                    supplierCurrency,
                    displayCurrency,
                  });
                  return {
                    ...card,
                    pricing: {
                      supplierPrice: breakdown.supplierPrice,
                      displayPrice: breakdown.displayPrice,
                      chargePrice: breakdown.chargePrice,
                      ...(breakdown.exchangeRateSnapshot ? { exchangeRateSnapshot: breakdown.exchangeRateSnapshot } : {}),
                    },
                  };
                } catch {
                  return card;
                }
              }),
            );
          } catch (err) {
            this.logger.warn(`[AGGREGATOR] Progressive hotel currency conversion failed for ${providerKey}: ${err}`);
          }
        }

        // Step 5: Emit display-ready chunk with merge mode
        // Hotels from different providers can share the same hotelGroupId,
        // so the frontend should merge by groupId rather than blind-append.
        // WS3: diet each chunk too — SSE payloads get the same image cap.
        await this.searchJobService!.reportSupplierResultsReady(
          searchId,
          providerKey,
          searchKey,
          applySearchCardDietToList(readyCards),
          'merge',
        );
      }
    } catch (err) {
      this.logger.warn(
        `[AGGREGATOR] Progressive hotel chunk emit failed for ${providerKey}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Chunk items into sub-arrays of the given sequential sizes. */
  private chunkBySizes<T>(items: T[], sizes: number[]): T[][] {
    const chunks: T[][] = [];
    let offset = 0;
    for (const size of sizes) {
      if (offset >= items.length) break;
      chunks.push(items.slice(offset, offset + size));
      offset += size;
    }
    return chunks;
  }

  /**
   * Generate a unique search key prefixed with 'hs_' for easy identification.
   */
  private generateSearchKey(): string {
    return `hs_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
  }

  private emptyResponse(message: string): CombinedHotelSearchResponse {
    const now = new Date();
    return {
      searchKey: '',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SEARCH_SESSION_TTL_SECONDS * 1000).toISOString(),
      warnings: [{ provider: null, code: 'NO_SEARCH_PROVIDERS', message }],
      hotels: [],
      providerResults: [],
    };
  }
}
