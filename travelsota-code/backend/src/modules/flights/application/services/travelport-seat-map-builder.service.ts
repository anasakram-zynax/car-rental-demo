import { Injectable, Logger } from '@nestjs/common';
import { TravelportPayloadBuilderService } from './travelport-payload-builder.service';
import type { SelectedOfferCacheEntry } from '../../domain/entities/flight-search-response';

/**
 * Unified seat map builder service.
 *
 * Provides three seat map body builders:
 * - GDS Method A: `buildFromProducts` — pre-price / catalog offers (uses ProductCriteriaAir)
 * - GDS Method B: `buildFromOfferList` — post-price / checkout (uses offer list identifiers)
 * - NDC: `buildFromCatalogProductOfferings` — catalog reference path
 *
 * Also provides the post-commit variant for both GDS and NDC:
 * - `buildFromReservationWorkbench` — after booking is committed
 *
 * Extracted from TravelportAncillaryService to separate seat map concerns
 * from the broader ancillary catalog orchestration.
 */
@Injectable()
export class TravelportSeatMapBuilderService {
  private readonly logger = new Logger(TravelportSeatMapBuilderService.name);

  constructor(
    private readonly payloadBuilder: TravelportPayloadBuilderService,
  ) {}

  /**
   * GDS Method A: SeatAvailabilityOfferingsBuildFromProducts.
   * Uses ProductCriteriaAir with SpecificFlightCriteria derived from the
   * reference list. Works for pre-price / catalog offers where the flight
   * criteria are known from the search response.
   *
   * Per V11 spec, ProductCriteriaAir is a SINGLE object (not array) for seat availability.
   */
  buildGdsFromProducts(cacheEntry: SelectedOfferCacheEntry): unknown {
    const productCriteriaAir = this.payloadBuilder.buildProductCriteriaAir(cacheEntry);

    if (productCriteriaAir.length === 0) {
      return {
        '@type': 'CatalogOfferingsQuerySeatAvailability',
        SeatAvailabilityOfferings: {
          '@type': 'SeatAvailabilityOfferingsBuildFromProducts',
          ProductCriteriaAir: {
            '@type': 'ProductCriteriaAir',
            sequence: 1,
            SpecificFlightCriteria: [],
            validateInventoryInd: true,
          },
        },
      };
    }

    const mergedFlightCriteria = productCriteriaAir.flatMap(
      (pca) => pca.SpecificFlightCriteria ?? [],
    );

    return {
      '@type': 'CatalogOfferingsQuerySeatAvailability',
      SeatAvailabilityOfferings: {
        '@type': 'SeatAvailabilityOfferingsBuildFromProducts',
        ProductCriteriaAir: {
          '@type': 'ProductCriteriaAir',
          sequence: 1,
          SpecificFlightCriteria: mergedFlightCriteria,
        },
      },
    };
  }

  /**
   * GDS Method B: SeatAvailabilityOfferingsBuildFromOfferList.
   * Used in the post-price / checkout path where an OfferListIdentifier
   * has been returned from the pricing step.
   */
  buildGdsFromOfferList(
    offerListIdentifier: string,
    offerId: string,
    productIds: string[],
  ): unknown {
    return {
      '@type': 'CatalogOfferingsQuerySeatAvailability',
      SeatAvailabilityOfferings: {
        '@type': 'SeatAvailabilityOfferingsBuildFromOfferList',
        BuildFromOfferList: {
          '@type': 'BuildFromOfferList',
          OfferListIdentifier: offerListIdentifier,
          OfferIdentifier: [{ id: offerId }],
          ProductIdentifier: productIds.map((pid) => ({ id: pid })),
        },
      },
    };
  }

  /**
   * NDC: SeatAvailabilityOfferingsBuildFromCatalogProductOfferings.
   * Uses catalog identifiers and product selections directly.
   */
  buildNdc(
    catalogUuid: string,
    productSelections: Array<{ offeringId: string; productIds: string[] }>,
  ): unknown {
    return {
      '@type': 'CatalogOfferingsQuerySeatAvailability',
      SeatAvailabilityOfferings: {
        '@type': 'SeatAvailabilityOfferingsBuildFromCatalogProductOfferings',
        BuildFromCatalogProductOfferingsRequest: {
          '@type': 'BuildFromCatalogProductOfferingsRequest',
          CatalogProductOfferingsIdentifier: {
            Identifier: { value: catalogUuid },
          },
          CatalogProductOfferingSelection: productSelections.map((sel) => ({
            '@type': 'CatalogProductOfferingSelection',
            CatalogProductOfferingIdentifier: { id: sel.offeringId },
            ProductIdentifier: sel.productIds.map((productId) => ({ id: productId })),
          })),
        },
      },
    };
  }

  /**
   * Post-commit seat availability: SeatAvailabilityOfferingsBuildFromReservationWorkbench.
   * Used after the booking is committed, by first calling buildFromLocator
   * to get a new workbench from the PNR.
   */
  buildFromReservationWorkbench(workbenchId: string): unknown {
    return {
      '@type': 'CatalogOfferingsQuerySeatAvailability',
      SeatAvailabilityOfferings: {
        '@type': 'SeatAvailabilityOfferingsBuildFromReservationWorkbench',
        BuildFromReservationWorkbench: {
          ReservationIdentifier: {
            Identifier: { value: workbenchId },
          },
        },
      },
    };
  }
}
