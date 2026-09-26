import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { FlightOfferSnapshotRepoPortToken } from '../ports/flight-offer-snapshot-repo.port';
import type { FlightOfferSnapshotRepoPort } from '../ports/flight-offer-snapshot-repo.port';
import { SelectedOfferCacheService } from './selected-offer-cache.service';
import { FlightOfferDetailViewMapper } from './flight-offer-detail-view.mapper';
import type {
  FlightOfferSnapshotEntity,
  CreateFlightOfferSnapshotInput,
  TravelportSupplierContext,
  DuffelSupplierContext,
  AmadeusSupplierContext,
} from '../../domain/entities/flight-offer-snapshot.entity';
import {
  isTravelportContextComplete,
  isDuffelContextComplete,
  isAmadeusContextComplete,
} from '../../domain/entities/flight-offer-snapshot.entity';
import type {
  SelectedOfferCacheEntry,
  NormalizedFlightOffer,
} from '../../domain/entities/flight-search-response';
import { MarkupService } from '../../../markup/markup.service';
import { CurrencyService } from '../../../currency/application/services/currency.service';

/** How long a snapshot is valid (30 minutes). */
const SNAPSHOT_TTL_SECONDS = 30 * 60;

@Injectable()
export class FlightOfferSnapshotService {
  private readonly logger = new Logger(FlightOfferSnapshotService.name);

  constructor(
    @Inject(FlightOfferSnapshotRepoPortToken)
    private readonly snapshotRepo: FlightOfferSnapshotRepoPort,
    private readonly selectedOfferCache: SelectedOfferCacheService,
    private readonly detailViewMapper: FlightOfferDetailViewMapper,
    private readonly markupService: MarkupService,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * Create a canonical snapshot from a selected offer.
   *
   * Phase 2: called when user clicks "Select" on a flight card.
   * Loads the offer from search cache, validates provider context completeness,
   * persists the snapshot, and returns the snapshot ID.
   */
  async createSnapshot(params: {
    provider: 'travelport' | 'duffel' | 'amadeus' | 'manual';
    offerId: string;
    searchKey: string;
    tripType?: 'one_way' | 'round_trip' | 'multi_city';
    displayCurrency?: string;
    userId?: string;
    agentId?: string;
    offerData?: Record<string, any>;
  }): Promise<{ snapshotId: string }> {
    const {
      provider,
      offerId,
      searchKey,
      tripType,
      userId,
      agentId,
      offerData,
      displayCurrency,
    } = params;

    // ── Manual (seed/demo) offers ──────────────────────────────
    // Seed inventory has no supplier session or identifiers: the card's
    // offerData IS the offer. Persist it directly with a manual supplier
    // context and the supplier-locked price from the card.
    if (provider === 'manual') {
      if (!offerData) {
        throw new BadRequestException(
          'Manual offer requires the full offer payload from the search card.',
        );
      }
      const supplierPrice = {
        amount: Number(
          offerData?.pricing?.supplierPrice?.amount ??
            offerData?.price?.total ??
            offerData?.totalPrice ??
            0,
        ),
        currency: String(
          offerData?.pricing?.supplierPrice?.currency ??
            offerData?.price?.currency ??
            'USD',
        ),
      };
      const snapshot = await this.snapshotRepo.create({
        provider,
        userId,
        agentId,
        searchKey: searchKey || `manual:${offerId}`,
        offerId,
        tripType: (tripType as any) ?? 'one_way',
        supplierContext: { contentSource: 'MANUAL' },
        normalizedOffer: offerData,
        pricingSnapshot: {
          amount: supplierPrice.amount,
          currency: supplierPrice.currency,
          supplierPrice,
          displayPrice:
            offerData?.pricing?.displayPrice ?? supplierPrice.amount,
        },
        expiresAt: new Date(
          Date.now() + SNAPSHOT_TTL_SECONDS * 1000,
        ).toISOString(),
      });
      this.logger.log(
        `Snapshot created (manual): id=${snapshot.id} offerId=${offerId}`,
      );
      return { snapshotId: snapshot.id };
    }

    // 1. Load from search cache (pass provider so the new provider-aware key is checked first)
    let cachedOffer = await this.selectedOfferCache.retrieve(
      searchKey,
      offerId,
      provider,
    );

    // Safety net: cache priming runs in background; retry once after a brief wait
    if (!cachedOffer) {
      await new Promise((r) => setTimeout(r, 600));
      cachedOffer = await this.selectedOfferCache.retrieve(
        searchKey,
        offerId,
        provider,
      );
    }

    if (!cachedOffer) {
      throw new NotFoundException(
        `Selected offer not found in cache (searchKey=${searchKey}, offerId=${offerId}). Search may have expired.`,
      );
    }
    // 2. Validate provider context is complete
    let supplierContext = this.buildSupplierContext(
      provider,
      cachedOffer,
      offerId,
    );

    // Combined (round-trip / multi-source) Travelport offers carry the
    // identifiers across BOTH legs. The cache entry can be partial or the
    // frontend may send richer metadata than we stored — merge what the
    // frontend supplied before declaring the context incomplete.
    if (!supplierContext && provider === 'travelport' && offerData) {
      const enriched = this.enrichTravelportContext(
        cachedOffer,
        offerData,
        offerId,
      );
      if (enriched)
        supplierContext = this.buildSupplierContext(
          provider,
          enriched,
          offerId,
        );
    }

    if (!supplierContext) {
      throw new BadRequestException(
        `Offer does not contain enough identifiers to proceed with booking. Please search again.`,
      );
    }

    // 3. Build the normalized offer and pricing snapshot
    const normalizedOffer = await this.buildNormalizedOffer(
      cachedOffer,
      offerId,
      provider,
      offerData,
      displayCurrency,
    );
    const pricingSnapshot = this.buildPricingSnapshot(cachedOffer, offerData);

    // 4. Persist
    const snapshot = await this.snapshotRepo.create({
      provider,
      userId,
      agentId,
      searchKey,
      offerId,
      tripType: (tripType as any) ?? 'one_way',
      contentSource: cachedOffer.contentSource as any,
      supplierContext,
      normalizedOffer,
      pricingSnapshot,
      expiresAt: new Date(
        Date.now() + SNAPSHOT_TTL_SECONDS * 1000,
      ).toISOString(),
    });

    this.logger.log(
      `Snapshot created: id=${snapshot.id} provider=${provider} offerId=${offerId}`,
    );

    return { snapshotId: snapshot.id };
  }

  /**
   * Retrieve a snapshot by ID, validate it hasn't expired, and return
   * the detail view ready for the frontend.
   *
   * Phase 3: called when the detail page loads by snapshotId.
   */
  async getSnapshotDetail(snapshotId: string): Promise<{
    snapshotId: string;
    provider: string;
    /** Supplier offer ID for ancillary and reprice operations */
    offerId: string;
    /** Search cache key for cached-offer lookups */
    searchKey: string;
    normalizedOffer: NormalizedFlightOffer;
    pricing: Record<string, any>;
    baggage: any;
    fareRules: any;
    expiresAt: string;
    tripType: string;
    detailView: any;
    searchCriteria?: Record<string, unknown>;
    userId?: string;
  }> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);

    if (!snapshot) {
      throw new NotFoundException(
        `Flight offer snapshot ${snapshotId} not found.`,
      );
    }

    if (new Date(snapshot.expiresAt) < new Date()) {
      throw new BadRequestException(
        `This flight offer has expired. Please search again.`,
      );
    }

    const normalizedOffer = snapshot.normalizedOffer as NormalizedFlightOffer;

    // Extract passenger count from the snapshot's supplier context
    const searchCriteria: Record<string, unknown> =
      snapshot.provider === 'travelport'
        ? ((snapshot.supplierContext as TravelportSupplierContext)
            .searchCriteria ?? {
            adults: 1,
          })
        : snapshot.provider === 'duffel'
          ? {
              adults:
                (snapshot.supplierContext as DuffelSupplierContext)
                  .searchCriteria?.adults ??
                (snapshot.supplierContext as DuffelSupplierContext).passengers
                  ?.length ??
                1,
            }
          : snapshot.provider === 'amadeus'
            ? {
                adults:
                  (snapshot.supplierContext as AmadeusSupplierContext)
                    .searchCriteria?.adults ?? 1,
              }
            : { adults: 1 };

    // Build the detail view using the existing mapper
    const detailView = await this.detailViewMapper.toDetailView({
      provider: snapshot.provider,
      normalizedOffer,
      rawOffer:
        snapshot.provider === 'duffel'
          ? (snapshot.supplierContext as DuffelSupplierContext).rawOffer
          : undefined,
      selectedOfferContext:
        snapshot.provider === 'travelport'
          ? (snapshot.supplierContext as TravelportSupplierContext)
              .referenceList
            ? {
                catalogUuid: (
                  snapshot.supplierContext as TravelportSupplierContext
                ).catalogUuid,
                offeringIds: [
                  (snapshot.supplierContext as TravelportSupplierContext)
                    .offeringId,
                ],
                productRefs: (
                  snapshot.supplierContext as TravelportSupplierContext
                ).productIds,
                productSelections:
                  (snapshot.supplierContext as TravelportSupplierContext)
                    .productSelections ?? [],
                referenceList: (
                  snapshot.supplierContext as TravelportSupplierContext
                ).referenceList,
                passengerCriteria:
                  (snapshot.supplierContext as TravelportSupplierContext)
                    .passengerCriteria ?? [],
                searchCriteria: (
                  snapshot.supplierContext as TravelportSupplierContext
                ).searchCriteria ?? {
                  from: '',
                  to: '',
                  departureDate: '',
                  adults: 1,
                },
                contentSource: (
                  snapshot.supplierContext as TravelportSupplierContext
                ).contentSource,
                currency: snapshot.pricingSnapshot?.currency,
              }
            : undefined
          : undefined,
      searchKey: snapshot.searchKey,
      catalogUuid:
        snapshot.provider === 'travelport'
          ? (snapshot.supplierContext as TravelportSupplierContext).catalogUuid
          : undefined,
    });

    // Apply the same markup engine used on search cards + booking preview so
    // the snapshot page shows the price the customer will actually pay —
    // never a raw supplier amount mid-flow.
    const rawPricing = snapshot.pricingSnapshot as Record<string, any> | null;
    let pricing: Record<string, any> = { ...(rawPricing ?? {}) };
    try {
      const supplierBase = Number(rawPricing?.amount ?? 0);
      if (supplierBase > 0) {
        const marked = await this.markupService.calculatePrice(
          supplierBase,
          'flights',
          undefined,
          snapshot.provider, // supplierId → supplier-scoped rules match
          undefined,
          undefined,
          rawPricing?.currency, // supplierBase is in this currency
        );
        pricing = {
          ...pricing,
          amount: marked.finalPrice,
          currency: rawPricing?.currency ?? 'USD',
          supplierBase,
          markupAmount: Math.max(0, marked.finalPrice - supplierBase),
          markupPercent: marked.effectiveMarkupPercent,
        };
      }
    } catch (err) {
      this.logger.warn(
        `[SNAPSHOT] Markup application failed for ${snapshot.id}: ${err instanceof Error ? err.message : err} — showing supplier price`,
      );
    }

    return {
      snapshotId: snapshot.id,
      provider: snapshot.provider,
      offerId: snapshot.offerId,
      searchKey: snapshot.searchKey,
      normalizedOffer,
      pricing,
      baggage: normalizedOffer.baggage,
      fareRules: {
        cabin: normalizedOffer.display?.cabinLabel ?? normalizedOffer.cabin,
        fareBrand:
          normalizedOffer.display?.fareBrand ?? normalizedOffer.brand?.name,
        refundPolicy: normalizedOffer.display?.refundPolicy,
        changePolicy: normalizedOffer.display?.changePolicy,
      },
      expiresAt: snapshot.expiresAt,
      tripType: snapshot.tripType,
      detailView,
      searchCriteria,
      userId: snapshot.userId,
    };
  }

  /**
   * Store the live fare conditions (refund/change penalties from the priced
   * offer) on the snapshot, so the details page, checkout and the booking
   * created from it all carry the same, authoritative policy.
   */
  async applyFreshFareRules(
    snapshotId: string,
    rules: {
      refund?: Record<string, unknown>;
      change?: Record<string, unknown>;
    },
  ): Promise<void> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);
    if (!snapshot) return;
    const offer = (snapshot.normalizedOffer ?? {}) as Record<string, any>;
    const known = (p?: Record<string, unknown>) =>
      !!p && (p.allowed !== undefined || p.free !== undefined);
    const display = { ...(offer.display ?? {}) };
    if (known(rules.refund)) display.refundPolicy = rules.refund;
    if (known(rules.change)) display.changePolicy = rules.change;
    await this.snapshotRepo.updateNormalizedOffer(snapshotId, {
      ...offer,
      display,
    });
  }

  /**
   * Retrieve the raw snapshot entity (for downstream reprice / hold / ticket).
   */
  async getSnapshotRaw(snapshotId: string): Promise<FlightOfferSnapshotEntity> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      throw new NotFoundException(
        `Flight offer snapshot ${snapshotId} not found.`,
      );
    }
    if (new Date(snapshot.expiresAt) < new Date()) {
      throw new BadRequestException(
        `This flight offer has expired. Please search again.`,
      );
    }
    return snapshot;
  }

  // ── Private Helpers ───────────────────────────────────────

  private buildSupplierContext(
    provider: string,
    cachedOffer: SelectedOfferCacheEntry,
    offerId: string,
  ):
    | TravelportSupplierContext
    | DuffelSupplierContext
    | AmadeusSupplierContext
    | null {
    if (provider === 'travelport') {
      const ctx: TravelportSupplierContext = {
        contentSource: cachedOffer.contentSource ?? 'GDS',
        catalogUuid: cachedOffer.catalogUuid,
        offeringId: cachedOffer.offeringIds?.[0] ?? offerId,
        productIds: cachedOffer.productRefs,
        productSelections: cachedOffer.productSelections,
        authority: (cachedOffer as any).authority,
        referenceList: cachedOffer.referenceList,
        travelportSessionId:
          cachedOffer.travelportPlusSessionId ??
          (cachedOffer as any).travelportSessionId,
        searchRepresentation: (cachedOffer as any).searchRepresentation,
        pcc: (cachedOffer as any).pcc,
        accessGroup: (cachedOffer as any).accessGroup,
        validatingCarrier: (cachedOffer as any).validatingCarrier,
        fareFamily: (cachedOffer as any).fareFamily,
        termsAndConditions: (cachedOffer as any).termsAndConditions ?? {},
        baggage: (cachedOffer as any).baggage ?? {},
        penalties: (cachedOffer as any).penalties ?? {},
        workflowKind: cachedOffer.workflowKind,
        capabilities: cachedOffer.capabilities,
        passengerCriteria: cachedOffer.passengerCriteria,
        searchCriteria: cachedOffer.searchCriteria,
        combinabilityCode: cachedOffer.combinabilityCode,
        brandOfferingId: cachedOffer.brandOfferingId,
        offeringIdentifierValue: (cachedOffer as any).offeringIdentifierValue,
      };
      return isTravelportContextComplete(ctx) ? ctx : null;
    }

    if (provider === 'duffel') {
      const rawOffer = (cachedOffer as any).rawOffer ?? cachedOffer;
      let slices: any[] = Array.isArray(rawOffer?.slices)
        ? rawOffer.slices
        : [];
      const passengers = Array.isArray(rawOffer?.passengers)
        ? rawOffer.passengers
        : [];
      // Fallback: reconstruct slices from normalized segments when raw Duffel slices are missing
      if (
        slices.length === 0 &&
        Array.isArray(rawOffer?.segments) &&
        rawOffer.segments.length > 0
      ) {
        slices = [{ segments: rawOffer.segments }];
      }
      const ctx: DuffelSupplierContext = {
        offerId,
        slices,
        passengers,
        expiresAt:
          rawOffer?.expires_at ??
          rawOffer?.expiresAt ??
          new Date(Date.now() + SNAPSHOT_TTL_SECONDS * 1000).toISOString(),
        availableServices: Array.isArray(rawOffer?.availableServices)
          ? rawOffer.availableServices
          : [],
        rawOffer: rawOffer,
        searchCriteria: cachedOffer.searchCriteria ?? { adults: 1 },
      };
      return isDuffelContextComplete(ctx) ? ctx : null;
    }

    if (provider === 'amadeus') {
      const ctx: AmadeusSupplierContext = {
        offerId,
        rawOffer: cachedOffer,
        searchCriteria: cachedOffer.searchCriteria
          ? {
              from: cachedOffer.searchCriteria.from,
              to: cachedOffer.searchCriteria.to,
              departureDate: cachedOffer.searchCriteria.departureDate,
              tripType: cachedOffer.searchCriteria.tripType,
              returnDate: cachedOffer.searchCriteria.returnDate,
              adults: cachedOffer.searchCriteria.adults,
            }
          : undefined,
      };
      return isAmadeusContextComplete(ctx) ? ctx : null;
    }

    return null;
  }

  /**
   * Merge missing Travelport supplier identifiers from the frontend-provided
   * offer data (which always carries the full normalized offer + metadata)
   * into a cache-like entry, so combined GDS/NDC offers can pass the
   * completeness check even when the cached record is partial.
   */
  private enrichTravelportContext(
    cachedOffer: SelectedOfferCacheEntry,
    offerData: Record<string, any>,
    offerId: string,
  ): SelectedOfferCacheEntry | null {
    const md = ((offerData.metadata as Record<string, unknown>) ??
      {}) as Record<string, any>;
    const productSelections = Array.isArray(md.productSelections)
      ? md.productSelections
      : cachedOffer.productSelections;
    const productRefs =
      Array.isArray(md.productRefs) && md.productRefs.length
        ? md.productRefs
        : cachedOffer.productRefs;

    return {
      ...cachedOffer,
      contentSource:
        (offerData.contentSource as string | undefined) ??
        cachedOffer.contentSource ??
        'GDS',
      catalogUuid:
        (md.providerCatalogUuid as string | undefined) ??
        cachedOffer.catalogUuid ??
        (md.catalogUuid as string | undefined),
      offeringIds:
        (Array.isArray(productSelections) && productSelections.length
          ? productSelections.map((s: any) => s?.offeringId).filter(Boolean)
          : []) ?? (md.offeringId ? [md.offeringId] : cachedOffer.offeringIds),
      productRefs,
      productSelections,
      brandOfferingId:
        (md.brandOfferingId as string | undefined) ??
        cachedOffer.brandOfferingId,
      combinabilityCode:
        (md.combinabilityCode as string | undefined) ??
        cachedOffer.combinabilityCode,
    };
  }

  private async buildNormalizedOffer(
    cachedOffer: SelectedOfferCacheEntry,
    offerId: string,
    provider: string,
    offerData?: Record<string, any>,
    explicitDisplayCurrency?: string,
  ): Promise<Record<string, any>> {
    // Phase 14 fix: When the frontend sends offerData (segments, pricing, display),
    // store it as the normalized offer for full detail page rendering.
    // Falls back to the minimal cache-based offer for backward compatibility.
    if (offerData) {
      // Safety net for the progressive-search race condition: the search
      // pipeline emits a fast, zero-currency-conversion card first, then
      // patches it with converted amounts a moment later. If the user
      // clicks "Select" in that window, offerData.display can still carry
      // refund/change penalties in the supplier's native currency — and
      // since this snapshot is immutable, that mismatch would persist
      // forever. Re-derive against the search's own target currency
      // (server-side, not client-controlled) before persisting; this is a
      // no-op whenever the frontend's data was already converted.
      // Precedence matters: `explicitDisplayCurrency` is what the user has
      // ACTUALLY selected right now (sent from the currency selector at
      // click time via CreateSnapshotDto.displayCurrency) — the freshest,
      // most authoritative signal, and immune to the progressive-search
      // race entirely since it never reads from the racy offer/cache data.
      // Only when the caller omits it do we fall back to the older chain:
      // `cachedOffer.currency` (the search's own display-currency request,
      // which can go stale if the user switches currency after searching
      // but before clicking Select) down through `offerData.price?.currency`
      // as a last resort (often still the supplier's native currency, e.g.
      // INR, even "after conversion" — it mirrors the raw fare).
      const targetCurrency =
        explicitDisplayCurrency ??
        cachedOffer.currency ??
        offerData.pricing?.displayPrice?.currency ??
        cachedOffer.supplierPrice?.currency ??
        offerData.price?.currency;
      const display = offerData.display ?? {};
      const convertedDisplay = {
        ...display,
        refundPolicy: await this.convertPolicyCurrency(
          display.refundPolicy,
          'refund',
          targetCurrency,
        ),
        changePolicy: await this.convertPolicyCurrency(
          display.changePolicy,
          'change',
          targetCurrency,
        ),
      };
      return {
        id: offerId,
        provider,
        contentSource: cachedOffer.contentSource ?? offerData.contentSource,
        totalPrice:
          offerData.price?.total ?? cachedOffer.supplierPrice?.amount ?? 0,
        currency:
          offerData.price?.currency ??
          cachedOffer.supplierPrice?.currency ??
          'USD',
        segments: offerData.segments ?? [],
        display: convertedDisplay,
        pricing: offerData.pricing ?? {},
        productId: offerData.productId,
        productIds: offerData.productIds ?? cachedOffer.productRefs,
        catalogUuid: offerData.catalogUuid ?? cachedOffer.catalogUuid,
        cabin: offerData.cabin,
        brandName: offerData.brandName,
        brandOfferingId: offerData.brandOfferingId,
        offeringIdentifierValue: offerData.offeringIdentifierValue,
        baggage: offerData.baggage ?? {},
        refundable: offerData.refundable,
        baggageText: offerData.baggageText,
        fareFamily: offerData.fareFamily,
        capabilities: cachedOffer.capabilities,
        metadata: {
          productRefs: cachedOffer.productRefs,
          productSelections: cachedOffer.productSelections,
          offeringId: cachedOffer.offeringIds?.[0],
          catalogOfferingId: cachedOffer.catalogUuid,
        },
      };
    }

    return {
      id: offerId,
      provider,
      contentSource: cachedOffer.contentSource,
      price: cachedOffer.supplierPrice ?? { total: 0, currency: 'USD' },
      segments: [],
      stops: 0,
      metadata: {
        productRefs: cachedOffer.productRefs,
        productSelections: cachedOffer.productSelections,
        offeringId: cachedOffer.offeringIds?.[0],
        catalogOfferingId: cachedOffer.catalogUuid,
      },
      capabilities: cachedOffer.capabilities,
    };
  }

  /**
   * Convert a refund/change penalty into the target currency, regenerating
   * its label to match. No-op when the policy is absent, has no parseable
   * penalty amount, or is already in the target currency (idempotent — safe
   * to call even when the frontend already converted it).
   */
  private async convertPolicyCurrency(
    policy:
      | { label?: string; allowed?: boolean; penaltyAmount?: number; penaltyCurrency?: string; free?: boolean }
      | undefined,
    kind: 'refund' | 'change',
    displayCurrency?: string,
  ): Promise<typeof policy> {
    if (!policy || !displayCurrency) return policy;
    if (policy.penaltyAmount == null || !policy.penaltyCurrency) return policy;
    if (policy.penaltyCurrency === displayCurrency) return policy;

    try {
      const breakdown = await this.currencyService.buildPricingBreakdown({
        supplierAmount: policy.penaltyAmount,
        supplierCurrency: policy.penaltyCurrency,
        displayCurrency,
      });
      const converted = breakdown.displayPrice?.amount;
      if (converted == null) return policy;

      const regeneratedLabel =
        policy.allowed && converted > 0
          ? kind === 'change'
            ? `Changes from ${converted} ${displayCurrency}`
            : `Cancellation from ${converted} ${displayCurrency}`
          : policy.label;

      return {
        ...policy,
        penaltyAmount: converted,
        penaltyCurrency: displayCurrency,
        label: regeneratedLabel,
      };
    } catch (err) {
      this.logger.warn(
        `Snapshot: failed to convert ${kind} policy penalty to ${displayCurrency}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return policy;
    }
  }

  private buildPricingSnapshot(
    cachedOffer: SelectedOfferCacheEntry,
    offerData?: Record<string, any>,
  ): Record<string, any> {
    // Canonical supplier price always comes from the backend cache entry.
    // Frontend offerData.pricing may be a PricingBlock with different shape
    // or an already-converted display price — never trust it as canonical.
    const supplierAmount = cachedOffer.supplierPrice?.amount ?? 0;
    const supplierCurrency = cachedOffer.supplierPrice?.currency ?? 'USD';
    return {
      amount: supplierAmount,
      currency: supplierCurrency,
      supplierPrice: cachedOffer.supplierPrice,
      displayPrice: offerData?.pricing?.displayPrice ?? supplierAmount,
    };
  }
}
