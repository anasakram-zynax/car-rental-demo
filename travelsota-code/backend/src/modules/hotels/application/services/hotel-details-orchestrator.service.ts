import { Inject, Injectable, Logger } from '@nestjs/common';
import { HotelsProviderRegistryService } from '../../providers/registry/hotels-provider-registry.service';
import { HotelSupplierLinksRepoPortToken } from '../ports/hotel-provider-mapping-repo.port';
import type { HotelSupplierLinksRepoPort } from '../ports/hotel-provider-mapping-repo.port';
import { CurrencyService } from '../../../currency/application/services/currency.service';
import { CacheService } from '../../../../shared/cache/cache.service';
import { MarkupService } from '../../../markup/markup.service';
import type {
  CombinedHotelDetailsResponse,
  HotelProviderRateSection,
  HotelRateView,
  HotelContentView,
  HotelSearchSession,
} from '../../domain/types/hotel-provider.types';
import type { HotelProvider } from '../../domain/interfaces/hotel-provider.interface';

/**
 * Orchestrates multi-provider hotel details fetching.
 *
 * Given a hotelGroupId from the combined search response, this service:
 * 1. Looks up which providers have this hotel from the HotelSupplierLinks table
 * 2. Resolves the correct providerHotelId for each provider
 * 3. Fetches details from each provider in parallel
 * 4. Combines results into a CombinedHotelDetailsResponse with provider sections
 */
@Injectable()
export class HotelDetailsOrchestratorService {
  private readonly logger = new Logger(HotelDetailsOrchestratorService.name);

  constructor(
    private readonly providerRegistry: HotelsProviderRegistryService,
    @Inject(HotelSupplierLinksRepoPortToken)
    private readonly mappingRepo: HotelSupplierLinksRepoPort,
    private readonly currencyService: CurrencyService,
    private readonly cacheService: CacheService,
    private readonly markupService: MarkupService,
  ) {}

  /**
   * Fetch hotel details from all providers that have this hotel.
   *
   * Uses the HotelSupplierLinks table to resolve providerHotelId per provider.
   *
   * @param searchKey - Search session key from the search response
   * @param hotelGroupId - Hotel group ID (canonical ID, auto-group ID, or provider:hotelId)
   * @param provider - Optional: only fetch from this specific provider
   * @param explicitProviderHotelId - Optional: skip mapping, use this ID directly
   */
  async getCombinedDetails(
    searchKey: string,
    hotelGroupId: string,
    provider?: string,
    explicitProviderHotelId?: string,
    displayCurrency?: string,
    fallbackCheckIn?: string,
    fallbackCheckOut?: string,
    fallbackRooms?: Array<{
      adults: number;
      children: number;
      childAges?: number[];
    }>,
    correctHotelName?: string,
    destinationName?: string,
  ): Promise<CombinedHotelDetailsResponse> {
    // Determine which providers to query
    let providerKeys: string[];
    if (provider) {
      providerKeys = [provider];
    } else {
      providerKeys = (await this.providerRegistry.getSearchProviders()).map(
        (p) => p.key,
      );
    }

    if (providerKeys.length === 0) {
      return {
        searchKey,
        hotelGroupId,
        hotel: { hotelGroupId, displayName: 'Unknown' },
        providerSections: [],
        warnings: [
          {
            provider: null,
            code: 'NO_PROVIDERS',
            message: 'No providers available.',
          },
        ],
      };
    }

    // Look up mappings for this hotelGroupId to get provider-specific IDs
    const mappings = await this.mappingRepo
      .findByCanonical(hotelGroupId)
      .catch(() => []);
    const hotelIdByProvider = new Map<string, string>();
    for (const m of mappings) {
      hotelIdByProvider.set(m.provider, m.providerHotelId);
    }

    // Fetch details from all relevant providers in parallel
    const sections = await Promise.all(
      providerKeys.map(async (key) => {
        try {
          const prov = this.providerRegistry.getProvider(key);

          // Resolve the provider-specific hotel ID:
          // 1. Use explicit providerHotelId if provided (frontend clicked a provider offer)
          // 2. From mapping table if available
          // 3. Parse provider:hotelId prefix from hotelGroupId (ratehawk:samaya_hotel_3)
          // 4. Fall back to hotelGroupId split (auto-group ID format: auto:provider_hotelId)
          // 5. Last resort: use hotelGroupId as-is
          let providerHotelId =
            explicitProviderHotelId ?? hotelIdByProvider.get(key);

          if (!providerHotelId) {
            // Check if hotelGroupId has a provider: prefix (e.g. ratehawk:samaya_hotel_3)
            const colonIdx = hotelGroupId.indexOf(':');
            if (colonIdx > 0) {
              const prefixProvider = hotelGroupId.slice(0, colonIdx);
              if (prefixProvider === key || !provider) {
                providerHotelId = hotelGroupId.slice(colonIdx + 1);
              }
            }
          }

          if (!providerHotelId && hotelGroupId.startsWith(`auto:`)) {
            // Auto-group ID format: auto:provider_hotelId
            const suffix = hotelGroupId.slice(5);
            if (suffix.startsWith(`${key}_`)) {
              providerHotelId = suffix.slice(key.length + 1);
            }
          }

          if (!providerHotelId) {
            providerHotelId = hotelGroupId;
          }

          const { details, rates } = await this.loadDetailsWithFallback(
            prov,
            key,
            providerHotelId,
            searchKey,
            {
              checkIn: fallbackCheckIn,
              checkOut: fallbackCheckOut,
              rooms: fallbackRooms,
            },
          );

          return {
            provider: key,
            providerHotelId: details.providerHotelId,
            status: 'available' as const,
            rates,
            hotel: details,
          };
        } catch (error: any) {
          this.logger.warn(
            `[DETAILS_ORCHESTRATOR] Provider "${key}" failed for hotel ${hotelGroupId}: ${error?.message ?? error}`,
          );
          return {
            provider: key,
            providerHotelId: '',
            status: 'failed' as const,
            rates: [],
          };
        }
      }),
    );

    // Build pricing blocks for each rate when displayCurrency is provided.
    // Markup is applied FIRST (same engine as search/booking) so the room
    // rates on the detail page always match the card price and the amount
    // actually charged at checkout — no raw-price leaks mid-flow.
    await this.applyMarkupToRatesForSections(sections);

    if (displayCurrency) {
      for (const section of sections) {
        if (section.status !== 'available') continue;
        for (const rate of section.rates) {
          try {
            const baseForDisplay =
              rate.customerPrice?.amount ?? rate.supplierPrice.amount;
            rate.pricing = await this.currencyService.buildPricingBreakdown({
              supplierAmount: baseForDisplay,
              supplierCurrency: rate.supplierPrice.currency,
              displayCurrency,
            });
            // Cancellation-fee tiers ship in the supplier's raw currency and
            // were never converted, so a customer could see the room rate in
            // their selected currency but the cancellation fee in whatever
            // the supplier returned (e.g. EUR/INR) — convert them the same
            // way the headline rate is converted, right here at the source.
            await this.convertCancellationPolicies(rate, displayCurrency);
          } catch (err) {
            // Conversion failed — leave pricing undefined so frontend can detect
            // the unavailable state rather than silently showing the wrong currency
            this.logger.error(
              `[DETAILS_ORCHESTRATOR] Pricing build failed for rate ${rate.rateId}: ${err instanceof Error ? err.message : err}. Rate will not show a converted display price.`,
            );
            // pricing stays undefined — frontend should show supplierPrice with a
            // "conversion unavailable" indicator rather than pretending conversion worked
          }
        }
      }
    }

    // Build hotel content info from the first available provider result
    const firstAvailable = sections.find(
      (s) => s.status === 'available' && (s as any).hotel,
    );
    const hotel: HotelContentView =
      firstAvailable && (firstAvailable as any).hotel
        ? {
            hotelGroupId,
            displayName: correctHotelName || (firstAvailable as any).hotel.name,
            images: (firstAvailable as any).hotel.images,
            description: (firstAvailable as any).hotel.description,
            address: (firstAvailable as any).hotel.address,
          }
        : {
            hotelGroupId,
            displayName: correctHotelName || 'Unknown',
          };

    const providerSections: HotelProviderRateSection[] = sections.map((s) => ({
      provider: s.provider,
      providerHotelId: s.providerHotelId,
      status: s.status,
      rates: s.rates,
    }));

    const warnings = sections
      .filter((s) => s.status === 'failed')
      .map((s) => ({
        provider: s.provider,
        code: 'PROVIDER_DETAILS_FAILED',
        message: `Provider "${s.provider}" could not load hotel details.`,
      }));

    // Static content enrichment (photos/descriptions from a separate content DB)
    // is out of scope for this manual-only starter kit — return as-is.
    return { searchKey, hotelGroupId, hotel, providerSections, warnings };
  }

  /**
   * Convert a rate's cancellation-policy fixed amounts (`amount`, not
   * `percentage`) from the supplier's currency into `displayCurrency`, and
   * stamp each entry's `currency` field so the frontend never has to guess
   * what currency a policy amount is in. No-op for percentage-only entries
   * (those are currency-agnostic) or when already in the target currency.
   */
  private async convertCancellationPolicies(
    rate: HotelRateView,
    displayCurrency: string,
  ): Promise<void> {
    if (!rate.cancellationPolicies?.length) return;
    const supplierCurrency = rate.supplierPrice.currency;

    for (const policy of rate.cancellationPolicies) {
      if (policy.amount == null || policy.amount === '') continue;
      const rawAmount = Number(policy.amount);
      if (!Number.isFinite(rawAmount)) continue;

      if (supplierCurrency === displayCurrency) {
        policy.currency = displayCurrency;
        continue;
      }

      try {
        const converted = await this.currencyService.convert(
          rawAmount,
          supplierCurrency,
          displayCurrency,
        );
        policy.amount = converted.amount;
        policy.currency = converted.currency;
      } catch {
        // Conversion unavailable — leave the raw supplier amount but still
        // stamp its real currency so the frontend can label it correctly
        // instead of silently showing it under the wrong currency code.
        policy.currency = supplierCurrency;
      }
    }
  }

  /** Marking loop shared by getCombinedDetails sections. */
  private async applyMarkupToRatesForSections(
    sections: Array<{
      status: string;
      provider: string;
      rates: HotelRateView[];
    }>,
  ): Promise<void> {
    for (const section of sections) {
      if (section.status !== 'available') continue;
      await this.applyMarkupToRates(section.provider, section.rates);
    }
  }

  /**
   * Apply the customer markup engine to a set of rates for one provider.
   * Sets rate.customerPrice on each rate. Used by getCombinedDetails AND by
   * the direct-provider details branch in the controller so EVERY detail
   * path serves marked rates — no raw-price leaks.
   */
  async applyMarkupToRates(
    providerKey: string,
    rates: Array<{
      supplierPrice: { amount: number; currency: string };
      customerPrice?: { amount: number; currency: string } | undefined;
    }>,
  ): Promise<void> {
    if (!rates?.length) return;
    let preloaded: Awaited<ReturnType<MarkupService['preloadRules']>> | null =
      null;
    try {
      preloaded = await this.markupService.preloadRules('hotels');
    } catch {
      return;
    }
    for (const rate of rates) {
      try {
        const marked = this.markupService.calculatePriceWithRules(
          rate.supplierPrice.amount,
          preloaded,
          undefined,
          providerKey,
        );
        rate.customerPrice = {
          amount: marked.finalPrice,
          currency: rate.supplierPrice.currency,
        };
      } catch {
        // Leave customerPrice unset — frontend falls back to supplierPrice.
      }
    }
  }

  /** Same marking for NormalizedHotelRate[] (direct provider.getHotelDetails path). */
  async applyMarkupToNormalizedRates(
    providerKey: string,
    rates: Array<{
      supplierAmount: number;
      supplierCurrency?: string;
      customerAmount?: number;
      customerCurrency?: string;
    }>,
  ): Promise<void> {
    if (!rates?.length) return;
    let preloaded: Awaited<ReturnType<MarkupService['preloadRules']>> | null =
      null;
    try {
      preloaded = await this.markupService.preloadRules('hotels');
    } catch {
      return;
    }
    for (const rate of rates) {
      try {
        const marked = this.markupService.calculatePriceWithRules(
          rate.supplierAmount,
          preloaded,
          undefined,
          providerKey,
        );
        rate.customerAmount = marked.finalPrice;
        rate.customerCurrency = rate.supplierCurrency ?? 'EUR';
      } catch {
        // Leave customerAmount unset — frontend falls back to supplierAmount.
      }
    }
  }

  /**
   * Load live rates for one provider, falling back to a direct single-hotel
   * re-search when the cached search session is missing or the hotel lookup
   * fails (e.g. cache fell over). Never leaves the detail page room-less
   * because of a stale/missing cache entry.
   */
  private async loadDetailsWithFallback(
    prov: HotelProvider,
    key: string,
    providerHotelId: string,
    searchKey: string,
    fallbackCriteria?: {
      checkIn?: string;
      checkOut?: string;
      rooms?: Array<{ adults: number; children: number; childAges?: number[] }>;
    },
  ): Promise<{ details: any; rates: HotelRateView[] }> {
    const mapRates = (r: any): HotelRateView => ({
      provider: key,
      providerHotelId: r.providerHotelId ?? providerHotelId,
      rateId: r.rateId ?? r.rateKey ?? '',
      roomName: r.roomName ?? '',
      boardName: r.boardName,
      refundable: r.refundable,
      cancellationPolicy: r.cancellationPolicyText ?? r.cancellationPolicy,
      cancellationPolicies: r.cancellationPolicies,
      occupancy:
        r.adults != null || r.children != null
          ? { adults: r.adults ?? 0, children: r.children ?? 0 }
          : undefined,
      supplierPrice: {
        amount:
          typeof r.supplierAmount === 'number'
            ? r.supplierAmount
            : (r.net ?? r.total ?? 0),
        currency: r.supplierCurrency ?? r.currency ?? 'EUR',
      },
      customerPrice: r.customerAmount
        ? { amount: r.customerAmount, currency: r.customerCurrency ?? 'EUR' }
        : undefined,
      rgExt: r.rgExt,
      roomCode: r.roomCode,
      roomKey: r.roomKey,
    });

    try {
      const details = await prov.getHotelDetails({
        searchKey,
        hotelId: `${key}:${providerHotelId}`,
      });
      const rates = (details.rates ?? []).map(mapRates);
      if (rates.length > 0) {
        return { details, rates };
      }
      this.logger.warn(
        `[DETAILS_ORCHESTRATOR] Provider "${key}" returned no rates for ${providerHotelId} — attempting direct re-search`,
      );
    } catch (error: any) {
      this.logger.warn(
        `[DETAILS_ORCHESTRATOR] Cached details lookup failed for ${key}:${providerHotelId} (${error?.message ?? error}) — attempting direct re-search`,
      );
    }

    // Fallback: re-search this single hotel using the original search criteria.
    const session = await this.cacheService
      .get<HotelSearchSession>(`search:${searchKey}`)
      .catch(() => null);
    const criteria = session?.criteria ?? {};
    const checkIn =
      (criteria.checkIn as string | undefined) ?? fallbackCriteria?.checkIn;
    const checkOut =
      (criteria.checkOut as string | undefined) ?? fallbackCriteria?.checkOut;
    const rooms =
      (criteria.rooms as
        | Array<{ adults: number; children: number; childAges?: number[] }>
        | undefined) ?? fallbackCriteria?.rooms;
    const numericCode = Number(providerHotelId);
    if (
      !checkIn ||
      !checkOut ||
      !Number.isFinite(numericCode) ||
      numericCode <= 0
    ) {
      throw new Error(
        `No cached rates for ${key}:${providerHotelId} and no valid criteria for a re-search`,
      );
    }

    const result = await prov.search({
      checkIn,
      checkOut,
      hotelCodes: [numericCode],
      rooms,
      currency: criteria.currency as string | undefined,
    });

    const hotel =
      (result.hotels ?? []).find(
        (h: any) =>
          String(h.providerHotelId ?? h.hotelId) === providerHotelId ||
          String(h.hotelId) === providerHotelId,
      ) ?? null;

    if (!hotel) {
      throw new Error(
        `Re-search for ${key}:${providerHotelId} returned no matching hotel`,
      );
    }

    const rates = (hotel.rates ?? []).map(mapRates);
    return {
      details: {
        provider: key,
        searchKey,
        hotelId: `${key}:${providerHotelId}`,
        providerHotelId,
        name: hotel.name ?? 'Unknown Hotel',
        checkIn,
        checkOut,
        rates: hotel.rates ?? [],
      },
      rates,
    };
  }
}
