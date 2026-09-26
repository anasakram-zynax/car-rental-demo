import { Injectable, Logger } from '@nestjs/common';
import type { SelectedOfferCacheEntry, ReferenceListFlight, ReferenceListProduct, ReferenceListBrand } from '../../domain/entities/flight-search-response';

// Shared ProductCriteriaAir shape used in price/buildfromproducts payloads.
// The ancillary service builds compatible objects for seat map requests
// via buildProductCriteriaAir().
interface ProductCriteriaAir {
  '@type': 'ProductCriteriaAir';
  sequence?: number;
  SpecificFlightCriteria: SpecificFlightCriteria[];
}

/**
 * Represents a single SpecificFlightCriteria for the buildfromproducts payload.
 */
interface SpecificFlightCriteria {
  '@type': 'SpecificFlightCriteria';
  flightNumber?: string;
  carrier?: string;
  departureDate?: string;
  departureTime?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  from?: string;
  to?: string;
  classOfService?: string;
  cabin?: string;
  segmentSequence?: number;
  brandTier?: number | null;
  AvailabilitySourceCode?: string | null;
  ContentSource: string;
}

/**
 * The top-level OfferQueryBuildFromProducts payload.
 */
interface OfferQueryBuildFromProducts {
  '@type': 'OfferQueryBuildFromProducts';
  validateInventoryInd: boolean;
  BuildFromProductsRequest: {
    '@type': 'BuildFromProductsRequestAir';
    PassengerCriteria: Array<{
      '@type': 'PassengerCriteria';
      number: number;
      passengerTypeCode: string;
    }>;
    ProductCriteriaAir: ProductCriteriaAir[];
  };
}

/**
 * Builds Travelport GDS full payloads (`OfferQueryBuildFromProducts`)
 * from cached selected offer data.
 *
 * The full payload format differs from the reference payload format.
 * Instead of referencing a catalog offering by identifier, it re-specifies
 * the product and flight criteria explicitly using data from the search
 * response's ReferenceList entries.
 *
 * This is the required format for:
 * - `/price/offers/buildfromproducts`
 * - `/book/airoffer/reservationworkbench/{id}/offers/buildfromproducts`
 */
@Injectable()
export class TravelportPayloadBuilderService {
  private readonly logger = new Logger(TravelportPayloadBuilderService.name);

  /**
   * Build an `OfferQueryBuildFromProducts` payload from a cached offer entry.
   *
   * For one-way trips, this produces a single ProductCriteriaAir.
   * For round-trips, this produces two ProductCriteriaAir entries
   * (outbound and inbound, preserving product order).
   *
   * @param cacheEntry - The cached selected offer data
   * @returns A full `OfferQueryBuildFromProducts` payload ready for the Travelport API
   * @throws Error if product refs or flight refs cannot be resolved
   */
  /**
   * Pick the reference list matching the entry's contentSource when per-source
   * lists are present (merged NDC+GDS search responses). Returns undefined for
   * legacy entries so callers fall back to the top-level referenceList.
   */
  private pickReferenceListForSource(
    cacheEntry: SelectedOfferCacheEntry,
  ): SelectedOfferCacheEntry['referenceList'] | undefined {
    const bySource = cacheEntry.referenceListBySource;
    if (!bySource) return undefined;
    const source =
      cacheEntry.contentSource === 'NDC' || cacheEntry.contentSource === 'GDS'
        ? cacheEntry.contentSource
        : undefined;
    if (!source) return undefined;
    const list = bySource[source];
    if (!list || !list.products || Object.keys(list.products).length === 0) {
      return undefined;
    }
    return list;
  }

  buildFromProducts(cacheEntry: SelectedOfferCacheEntry): OfferQueryBuildFromProducts {
    const { productSelections, passengerCriteria } = cacheEntry;

    // Resolve content source: use the cached value from the search response (e.g. 'NDC'
    // or 'GDS'), falling back to 'GDS' for legacy cache entries that lack it.
    // The cache entry's contentSource was already resolved with env var fallback at cache time.
    const resolvedContentSource = cacheEntry.contentSource ?? 'GDS';

    // Use the reference list of the offer's OWN channel when the entry carries
    // per-source lists (merged NDC+GDS searches) — the top-level referenceList
    // can belong to the other channel for legacy/mixed entries.
    const referenceList =
      this.pickReferenceListForSource(cacheEntry) ?? cacheEntry.referenceList;

    if (!referenceList.products || Object.keys(referenceList.products).length === 0) {
      throw new Error('FLIGHTS_PAYLOAD_BUILD_FAILED: No reference list products available');
    }

    if (!referenceList.flights || Object.keys(referenceList.flights).length === 0) {
      throw new Error('FLIGHTS_PAYLOAD_BUILD_FAILED: No reference list flights available');
    }

    // Build ProductCriteriaAir for each product selection
    const productCriteriaAir: ProductCriteriaAir[] = [];

    for (const selection of productSelections) {
      for (const productRef of selection.productIds) {
        const product = referenceList.products[productRef];
        if (!product) {
          throw new Error(
            `FLIGHTS_PAYLOAD_BUILD_FAILED: Product ref "${productRef}" not found in reference list`,
          );
        }

        const specificFlightCriteria = this.buildSpecificFlightCriteria(
          product,
          referenceList.flights,
          0,
          referenceList.brands,
          resolvedContentSource,
        );

        if (specificFlightCriteria.length > 0) {
          productCriteriaAir.push({
            '@type': 'ProductCriteriaAir',
            sequence: productCriteriaAir.length + 1,
            SpecificFlightCriteria: specificFlightCriteria,
          });
        }
      }
    }

    if (productCriteriaAir.length === 0) {
      throw new Error('FLIGHTS_PAYLOAD_BUILD_FAILED: No flight criteria could be built from the cached offer');
    }

    const criteria = passengerCriteria.length > 0
      ? passengerCriteria
      : [{ number: 1, passengerTypeCode: 'ADT' as const }];

    return {
      '@type': 'OfferQueryBuildFromProducts',
      validateInventoryInd: true,
      BuildFromProductsRequest: {
        '@type': 'BuildFromProductsRequestAir',
        ...(cacheEntry.currency && { CurrencyCode: cacheEntry.currency }),
        PassengerCriteria: criteria.map((pc) => ({
          '@type': 'PassengerCriteria',
          number: pc.number,
          passengerTypeCode: pc.passengerTypeCode,
        })),
        ProductCriteriaAir: productCriteriaAir,
      },
    };
  }/**
   * Build ProductCriteriaAir entries from a cached offer entry.
   * Public so it can be reused by the ancillary service for seat map
   * requests using the `BuildFromProducts` format.
   *
   * For one-way trips, this produces a single ProductCriteriaAir.
   * For round-trips, this produces two ProductCriteriaAir entries
   * (outbound and inbound, preserving product order).
   */
  buildProductCriteriaAir(cacheEntry: SelectedOfferCacheEntry): ProductCriteriaAir[] {
    const { productSelections } = cacheEntry;
    const resolvedContentSource = cacheEntry.contentSource ?? 'GDS';
    const referenceList =
      this.pickReferenceListForSource(cacheEntry) ?? cacheEntry.referenceList;

    if (!referenceList.products || Object.keys(referenceList.products).length === 0) {
      return [];
    }

    if (!referenceList.flights || Object.keys(referenceList.flights).length === 0) {
      return [];
    }

    const productCriteriaAir: ProductCriteriaAir[] = [];
    let globalSegmentIndex = 0;

    for (const selection of productSelections) {
      for (const productRef of selection.productIds) {
        const product = referenceList.products[productRef];
        if (!product) continue;

        const specificFlightCriteria = this.buildSpecificFlightCriteria(
          product,
          referenceList.flights,
          globalSegmentIndex,
          referenceList.brands,
          resolvedContentSource,
        );

        globalSegmentIndex += specificFlightCriteria.length;

        if (specificFlightCriteria.length > 0) {
          productCriteriaAir.push({
            '@type': 'ProductCriteriaAir',
            sequence: productCriteriaAir.length + 1,
            SpecificFlightCriteria: specificFlightCriteria,
          });
        }
      }
    }

    return productCriteriaAir;
  }

  /**
   * Build SpecificFlightCriteria entries from a ReferenceListProduct
   * and the corresponding ReferenceListFlight entries.
   */
  private buildSpecificFlightCriteria(
    product: ReferenceListProduct,
    flights: Record<string, ReferenceListFlight>,
    globalSegmentStart: number,
    brands?: Record<string, ReferenceListBrand>,
    contentSource: string = 'GDS',
  ): SpecificFlightCriteria[] {
    const criteria: SpecificFlightCriteria[] = [];

    const flightSegments = product.flightSegments ?? [];

    if (flightSegments.length === 0) {
      throw new Error(`FLIGHTS_PAYLOAD_BUILD_FAILED: Product ${product.id} has no flight segments`);
    }

    // Map brand tier from ReferenceListBrand if available
    let brandTier: number | null = null;
    if (product.brandRef && brands?.[product.brandRef]?.tier !== undefined) {
      brandTier = brands[product.brandRef].tier!;
    }

    for (let segIdx = 0; segIdx < flightSegments.length; segIdx++) {
      const segment = flightSegments[segIdx];
      const flightRef = segment.flightRef;
      if (!flightRef) {
        throw new Error(`FLIGHTS_PAYLOAD_BUILD_FAILED: Product ${product.id} segment ${segIdx} has no flightRef`);
      }

      const flight = flights[flightRef];
      if (!flight) {
        throw new Error(`FLIGHTS_PAYLOAD_BUILD_FAILED: Flight ref "${flightRef}" for product ${product.id} not found in reference list`);
      }

      // Get segment-specific cabin/classOfService from the reference list product.
      // passengerFlights is indexed by PASSENGER (not segment); flightProducts
      // within each passenger is indexed by segment. For the first passenger,
      // pick the segment-specific entry; fall back to first if array is shorter.
      const firstPassenger = product.passengerFlights?.[0];
      const flightProduct = firstPassenger?.flightProducts?.[segIdx]
        ?? firstPassenger?.flightProducts?.[0];
      const cabin = flightProduct?.cabin;
      const classOfService = flightProduct?.classOfService;

      criteria.push({
        '@type': 'SpecificFlightCriteria',
        flightNumber: flight.number,
        carrier: flight.carrier,
        departureDate: flight.departure?.date,
        departureTime: flight.departure?.time,
        arrivalDate: flight.arrival?.date,
        arrivalTime: flight.arrival?.time,
        from: flight.departure?.location,
        to: flight.arrival?.location,
        classOfService: classOfService,
        cabin: cabin,
        segmentSequence: segment.segmentSequence ?? (globalSegmentStart + segIdx + 1),
        brandTier,
        AvailabilitySourceCode: product.availabilitySourceCode ?? null,
        ContentSource: contentSource,
      });
    }

    return criteria;
  }
}
