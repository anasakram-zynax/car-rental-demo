/**
 * Phase 3+ — Unified Ancillary Catalog Types
 *
 * These types define the contract between the backend catalog endpoint
 * and the frontend offer-detail page. They cover seats, baggage,
 * paid services (ancillary shop), and meal SSR requests.
 */

/** Classifier for a single ancillary option returned by the catalog endpoint */
export type AncillaryCatalogType =
  | 'seat'
  | 'baggage'
  | 'meal'
  | 'sports_equipment'
  | 'priority'
  | 'lounge'
  | 'wifi'
  | 'pet'
  | 'other';

/** Source that produced this option — drives how it must be added during booking */
export type AncillaryCatalogSource = 'seatavailability' | 'ancillaryshop' | 'specialservices';

/** A monetary amount with currency */
export interface AncillaryMoney {
  amount: number;
  currency: string;
}

/**
 * A single purchasable / requestable ancillary option returned by the catalog.
 * Each option carries the supplier identifiers needed to add it during booking.
 */
export interface AncillaryCatalogOption {
  /** Stable ID for dedup and selection tracking (e.g. `${source}:${type}:${productId}`) */
  id: string;
  type: AncillaryCatalogType;
  source: AncillaryCatalogSource;
  label: string;
  description?: string;
  price: AncillaryMoney;
  /** True if this option is already included in the offer price (display only, not addable) */
  includedInOfferPrice?: boolean;
  /** True if this option requires airline confirmation (e.g. meal SSRs) */
  requiresSupplierConfirmation?: boolean;
  /** Traveler index this option applies to (0-based, populated per-traveler) */
  travelerIndex?: number;
  travelerRef?: string;
  segmentRef?: string;
  segmentLabel?: string;
  quantityMin?: number;
  quantityMax?: number;
  /** Supplier identifiers needed to add this option to the workbench */
  supplier: AncillarySupplierIdentifiers;
  /** Raw Travelport response fragment for debugging */
  raw?: unknown;
}

/** Supplier identifiers required to add an ancillary option to a committed workbench */
export interface AncillarySupplierIdentifiers {
  /** Provider that supplied this option ('travelport' | 'duffel') */
  provider?: string;
  /** Duffel service ID for seat selection */
  serviceId?: string;
  /** Duffel passenger ID */
  passengerId?: string;
  /** Duffel segment ID */
  segmentId?: string;
  /** Duffel slice ID */
  sliceId?: string;
  /** Response-level CatalogOfferingsAncillaryListResponse.Identifier.value — used for baggage/services add */
  catalogOfferingsIdentifier?: string;
  /** CatalogOfferingsID-level Identifier.value — used for seat add (backward compat) */
  catalogOfferingsIdIdentifier?: string;
  /** CatalogOffering.id — used for baggage/services add */
  catalogOfferingIdentifier?: string;
  /** CatalogOffering.Identifier.value — used for seat add */
  catalogOfferingIdentifierValue?: string;
  /** Product.id */
  productIdentifier?: string;
  /** Synthetic product identifier (for seats: `catalogOfferingIdentifierValue:Brand:SeatName`) */
  productIdentifierSynthetic?: string;
  /** Brand name from Product.Brand.name */
  brandName?: string;
  /** Brand tier from Product.Brand.tier */
  brandTier?: number;
  /** Whether this seat has a charge (ProductSeatAvailability.paidSeatInd) */
  paidSeatInd?: boolean;
  travelerIdentifierRef?: string;
  /** Seat assignment (e.g. '10A') — only for seat options */
  seatAssignment?: string;
  /** SSR code (e.g. 'VGML') — only for meal options */
  ssrCode?: string;
  /** Offer identifier value from the workbench response */
  offerIdentifierValue?: string;
  /** Reservation identifier value from the workbench response */
  reservationIdentifierValue?: string;
}

/** Per-section unavailable reasons */
export interface AncillaryUnavailableReasons {
  seats?: string;
  baggage?: string;
  services?: string;
  meals?: string;
}

/**
 * Full catalog response returned by the unified /flights/ancillaries/catalog endpoint.
 * All four sections are always present (may be empty arrays).
 */
export interface AncillaryCatalogResponse {
  ok: boolean;
  searchKey: string;
  offerId: string;
  contentSource: 'NDC' | 'GDS';
  /** ISO-8601 timestamp when this catalog expires */
  expiresAt: string;
  seats: AncillaryCatalogOption[];
  baggage: AncillaryCatalogOption[];
  services: AncillaryCatalogOption[];
  meals: AncillaryCatalogOption[];
  unavailableReasons: AncillaryUnavailableReasons;
  /** Included baggage summary from the fare (separate from selectable paid baggage) */
  includedBaggage?: {
    summaryLabel: string;
    carryOnLabel?: string;
    checkedLabel?: string;
  };
  /**
   * Describes what can be selected before vs during/after checkout.
   * - 'pre_booking_quote': Available now as a quote; will be revalidated during booking
   * - 'checkout_quote': Available only after traveler details are collected (checkout session)
   * - 'post_booking_only': Available only after booking is created (e.g. seats on confirmed PNR)
   */
  availabilityMode?: 'pre_booking_quote' | 'checkout_quote' | 'post_booking_only';
}

/**
 * Temporary workbench context extracted from the quote workbench.
 * Cached alongside the catalog response so that identifiers can be
 * used later (or discarded safely).
 */
export interface QuoteWorkbenchContext {
  workbenchId: string;
  sessionId?: string;
  /** CatalogOfferingsIdentifier value from the add-offer response */
  catalogOfferingsIdentifier?: string;
  /** Offer identifier value(s) from the add-offer response */
  offerIdentifiers: string[];
  /** Traveler identifier mapping (index → identifier value) */
  travelerIdentifiers: string[];
  /** Trace ID from the add-offer response */
  traceId?: string;
  /** Transaction ID from the add-offer response */
  transactionId?: string;
}

/**
 * Cached catalog value stored in the cache service.
 */
export interface CachedCatalog {
  response: AncillaryCatalogResponse;
  workbench: QuoteWorkbenchContext;
  cachedAt: string;
  expiresAt: string;
}

/**
 * Input for the /flights/ancillaries/catalog endpoint.
 */
export interface AncillaryCatalogInput {
  searchKey: string;
  offerId: string;
  travelerCount: number;
}

/**
 * Configured meal SSR codes.
 * These define the meal options shown as request-only in the catalog.
 */
export const MEAL_SSR_CODES: Array<{ code: string; name: string; dietaryType: string; description: string }> = [
  { code: 'VGML', name: 'Vegan Meal', dietaryType: 'Vegan', description: 'Plant-based vegan meal' },
  { code: 'AVML', name: 'Asian Vegetarian Meal', dietaryType: 'Vegetarian', description: 'Asian-style vegetarian meal' },
  { code: 'HNML', name: 'Hindu Meal', dietaryType: 'Vegetarian', description: 'Hindu dietary requirements' },
  { code: 'KSML', name: 'Kosher Meal', dietaryType: 'Kosher', description: 'Kosher prepared meal' },
  { code: 'MOML', name: 'Muslim Meal', dietaryType: 'Halal', description: 'Halal prepared meal' },
  { code: 'CHML', name: 'Child Meal', dietaryType: 'Child', description: 'Age-appropriate child meal' },
  { code: 'BBML', name: 'Baby Meal', dietaryType: 'Baby', description: 'Baby food and formula' },
];

/** Cache TTL for ancillary catalog in seconds (10 minutes) */
export const ANCILLARY_CATALOG_TTL_SECONDS = 600;

/** Cache key prefix for ancillary catalog */
export const ANCILLARY_CATALOG_CACHE_PREFIX = 'travelport:ancillary-catalog';
