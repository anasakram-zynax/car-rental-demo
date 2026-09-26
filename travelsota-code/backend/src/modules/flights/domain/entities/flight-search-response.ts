export interface NormalizedFlightSearchRequestSummary {
  from: string;
  to: string;
  departureDate: string;
  tripType?: 'one_way' | 'round_trip' | 'multi_city';
  returnDate?: string;
  legs?: Array<{ origin: string; destination: string; departureDate: string }>;
  cabinClass?: string;
  adults: number;
  contentSourceList: string[];
}

export interface NormalizedFlightSearchResponse {
  provider: string;
  request: NormalizedFlightSearchRequestSummary;
  warnings: string[];
  offers: NormalizedFlightOffer[];
  meta?: NormalizedFlightSearchMeta;
}

export interface NormalizedFlightSearchMeta {
  transactionId?: string;
  catalogUuid?: string;
  searchKey?: string;
  performance?: {
    cacheHit: boolean;
    deduplicated: boolean;
    providerLatencyMs?: number;
  };
  /** Parsed reference list entries from the Travelport search response.
   * These are used by the full payload builder (`buildfromproducts`)
   * to re-construct product and flight criteria for pricing/booking.
   */
  referenceList?: {
    products?: Record<string, ReferenceListProduct>;
    flights?: Record<string, ReferenceListFlight>;
    brands?: Record<string, ReferenceListBrand>;
  };
  /** Provider-specific search contexts — preserves per-source metadata for V2 cache */
  providerContexts?: {
    GDS?: {
      catalogUuid: string;
      referenceList?: {
        products?: Record<string, ReferenceListProduct>;
        flights?: Record<string, ReferenceListFlight>;
        brands?: Record<string, ReferenceListBrand>;
      };
      rawMeta?: Record<string, unknown>;
    };
    NDC?: {
      catalogUuid: string;
      rawMeta?: Record<string, unknown>;
    };
  };
}

/**
 * A ReferenceListProduct entry from the Travelport search response.
 * Contains product-level details needed for `buildfromproducts` payload.
 */
export interface ReferenceListProduct {
  id?: string;
  totalDuration?: string;
  brandRef?: string;
  flightSegments?: Array<{
    flightRef?: string;
    segmentSequence?: number;
  }>;
  passengerFlights?: Array<{
    flightProducts?: Array<{
      cabin?: string;
      classOfService?: string;
      fareBasisCode?: string;
    }>;
  }>;
  availabilitySourceCode?: string;
}

/**
 * A ReferenceListFlight entry from the Travelport search response.
 * Contains flight-level details needed for `buildfromproducts` payload.
 */
export interface ReferenceListFlight {
  id?: string;
  carrier?: string;
  number?: string;
  operatingCarrier?: string;
  departure?: {
    location?: string;
    date?: string;
    time?: string;
    terminal?: string;
  };
  arrival?: {
    location?: string;
    date?: string;
    time?: string;
    terminal?: string;
  };
  duration?: string;
  equipment?: string;
  stops?: number;
}

/**
 * A ReferenceListBrand entry from the Travelport search response.
 */
export interface ReferenceListBrand {
  id?: string;
  name?: string;
  tier?: number;
}

/**
 * Cache entry for a selected offer, stored after search is complete.
 * Used by the full payload builder to reconstruct `buildfromproducts` payloads
 * during pricing, booking, and ancillary workflows.
 */
export interface TravelportOfferCapabilities {
  /** Seat map / seat selection available in pre-booking preview */
  seatMapAvailable: boolean;
  /** Ancillary shop (baggage/services) available — NDC only currently */
  ancillaryShopAvailable: boolean;
  /** Meal SSR request/preference supported */
  mealSsrSupported: boolean;
  /** Post-booking manage-booking (re-shop, cancel, change seats) available */
  postBookingManageAvailable: boolean;
}

export type TravelportWorkflowKind = 'ndc' | 'gds';

/**
 * Cache entry for a selected offer, stored after search is complete.
 * Used by the full payload builder to reconstruct `buildfromproducts` payloads
 * during pricing, booking, and ancillary workflows.
 *
 * V2 fields (capabilities, workflowKind) added for the hybrid GDS+NDC workflow.
 */
export interface SelectedOfferCacheEntry {
  catalogUuid: string;
  offeringIds: string[];
  productRefs: string[];
  productSelections: Array<{ offeringId: string; productIds: string[] }>;
  brandOfferingId?: string;
  combinabilityCode?: string;
  /** User's preferred currency (e.g. USD) to pass as CurrencyCode in buildfromproducts payloads */
  currency?: string;
  /** Content source from the search response (e.g. 'NDC' or 'GDS'). Used by the payload builder
   *  instead of hardcoded 'GDS'. Falls back to TRAVELPORT_DEFAULT_CONTENT_SOURCE env var. */
  contentSource?: string;
  /** Immutable supplier price at time of search — single currency conversion anchor.
   *  All reprice/preview/confirm steps compare against this to prevent price drift. */
  supplierPrice?: { amount: number; currency: string };
  /** V2: Workflow kind — determines which payload builder to use */
  workflowKind?: TravelportWorkflowKind;
  /** V2: Capability model — determines what ancillaries can be offered */
  capabilities?: TravelportOfferCapabilities;
  /** Travelport session identifier from search response — required for multi-city booking */
  travelportPlusSessionId?: string;
  /** Per-content-source reference lists from a merged NDC+GDS search.
   *  referenceList above is the active source's list; this map keeps each
   *  channel's own list so the workflow never prices/validates an NDC offer
   *  against the GDS reference list (or vice versa). */
  referenceListBySource?: {
    NDC?: {
      products: Record<string, ReferenceListProduct>;
      flights: Record<string, ReferenceListFlight>;
      brands?: Record<string, ReferenceListBrand>;
    };
    GDS?: {
      products: Record<string, ReferenceListProduct>;
      flights: Record<string, ReferenceListFlight>;
      brands?: Record<string, ReferenceListBrand>;
    };
  };
  /** Phase 14: Raw normalized offer from the search response — stored during aggregation.
   *  DuffelSnapshotService uses this to populate slices/passengers for Duffel snapshots. */
  rawOffer?: unknown;
  passengerCriteria: Array<{ number: number; passengerTypeCode: string }>;
  referenceList: {
    products: Record<string, ReferenceListProduct>;
    flights: Record<string, ReferenceListFlight>;
    brands?: Record<string, ReferenceListBrand>;
  };
  searchCriteria: {
    from: string;
    to: string;
    departureDate: string;
    tripType?: string;
    returnDate?: string;
    cabinClass?: string;
    adults: number;
    legs?: Array<{ origin: string; destination: string; departureDate: string }>;
  };
}

// ── Unified Ancillary Types (Phase 4) ──

/**
 * Structured seat selection for booking.
 */
export interface SeatSelection {
  type: 'seat';
  travelerIndex: number;
  travelerRef: string;
  segmentRef: string;
  seatNumber: string;
  ancillaryProductId: string;
  /** Response-level catalog offerings identifier from seat availability response */
  catalogOfferingsIdentifier?: string;
  /** CatalogOffering.Identifier.value from seat availability response */
  catalogOfferingIdentifierValue?: string;
  price: {
    amount: number;
    currency: string;
  };
}

/**
 * Structured baggage selection for booking.
 */
export interface BaggageSelection {
  type: 'baggage';
  travelerIndex: number;
  travelerRef: string;
  journeyRef?: string;
  segmentRef: string;
  ancillaryProductId: string;
  /** Catalog offering-level identifier from ancillary shop response — used for Travelport add */
  catalogOfferingIdentifier?: string;
  /** Catalog offerings-level identifier from ancillary shop response */
  catalogOfferingsIdentifier?: string;
  label: string;
  baggageType: string;
  weight: string;
  pieces: number;
  price: {
    amount: number;
    currency: string;
  };
}

/**
 * Structured meal selection for booking.
 */
export interface MealSelection {
  type: 'meal';
  travelerIndex: number;
  travelerRef: string;
  segmentRef: string;
  ancillaryProductId: string;
  mealCode: string;
  mealName: string;
  dietaryType: string;
  price: {
    amount: number;
    currency: string;
  };
}

/**
 * Structured service selection for booking (sports equipment, priority, lounge, Wi-Fi, pet, etc.).
 */
export interface ServiceSelection {
  type: 'sports_equipment' | 'priority' | 'lounge' | 'wifi' | 'pet' | 'other';
  travelerIndex: number;
  travelerRef: string;
  segmentRef: string;
  ancillaryProductId: string;
  /** Catalog offering-level identifier from the ancillary shop response */
  catalogOfferingIdentifier?: string;
  /** Catalog offerings-level identifier from the ancillary shop response */
  catalogOfferingsIdentifier?: string;
  label: string;
  serviceType: string;
  quantity: number;
  price: {
    amount: number;
    currency: string;
  };
}

/**
 * Unified ancillary container used in checkout/booking requests.
 */
export interface AncillarySelections {
  seats: SeatSelection[];
  baggage: BaggageSelection[];
  meals: MealSelection[];
  services: ServiceSelection[];
}

// Append to the import line in flight-search-response.ts for the AncillarySelections export

/**
 * Provider-neutral capability model for a flight offer.
 * Tells the frontend which ancillaries/extras are available for this offer.
 */
export interface FlightOfferCapabilities {
  /** Seat selection / seat map available in pre-booking preview */
  seats: boolean;
  /** Paid baggage add-ons available */
  baggage: boolean;
  /** Meal preference / SSR available */
  meals: boolean;
  /** Other services (priority, lounge, Wi-Fi, sports equipment, etc.) */
  services: boolean;
  /** Cancellation via API possible */
  cancellation: boolean;
  /** Free cancellation — allowed with zero penalty */
  freeCancellation?: boolean;
}

/**
 * Default capabilities for Travelport offers (full ancillary support).
 */
export const TRAVELPORT_DEFAULT_CAPABILITIES: FlightOfferCapabilities = {
  seats: true,
  baggage: true,
  meals: true,
  services: true,
  cancellation: false, // Travelport cancel not yet implemented via API
};

/**
 * Default capabilities for Duffel offers.
 * Duffel supports seats (via seat maps) and included baggage via catalog.
 * Meals and extra services are not available from Duffel.
 */
export const DUFFEL_DEFAULT_CAPABILITIES: FlightOfferCapabilities = {
  seats: true,
  baggage: true,
  meals: false,
  services: false,
  cancellation: true, // two-step order_cancellations flow implemented
};

export interface DisplayOfferFields {
  airlineCode?: string;
  airlineName?: string;
  airlineLogoUrl?: string;
  flightNumber?: string;

  origin: {
    code: string;
    cityName?: string;
    airportName?: string;
    label: string;
  };

  destination: {
    code: string;
    cityName?: string;
    airportName?: string;
    label: string;
  };

  durationLabel?: string;
  stopsLabel?: string;
  fareBrand?: string;
  cabinLabel?: string;

  baggage?: {
    carryOnLabel?: string;
    checkedLabel?: string;
    summaryLabel?: string;
  };

  changePolicy?: {
    label: string;
    allowed?: boolean;
    penaltyAmount?: number;
    penaltyCurrency?: string;
    /** Penalty as a share of the fare (0-100) when the supplier quotes a percent. */
    penaltyPercent?: number;
  };

  refundPolicy?: {
    label: string;
    allowed?: boolean;
    penaltyAmount?: number;
    penaltyCurrency?: string;
    /** Penalty as a share of the fare (0-100) when the supplier quotes a percent. */
    penaltyPercent?: number;
    free?: boolean;
  };

  supplier?: 'travelport' | 'duffel' | 'amadeus';

  /** Journey-level metadata for multi-directional trips (round-trip).
   *  When present, the frontend should render journeys from this list
   *  instead of running its own partitionJourneys heuristic. */
  journeys?: Array<{
    direction: 'outbound' | 'return' | 'itinerary';
    label: string;
    segmentCount: number;
  }>;
}

export interface DisplaySegmentFields {
  airlineCode?: string;
  airlineName?: string;
  airlineLogoUrl?: string;
  flightNumber?: string;
  operatingAirlineName?: string;

  origin: {
    code: string;
    cityName?: string;
    airportName?: string;
    terminal?: string;
    label: string;
  };

  destination: {
    code: string;
    cityName?: string;
    airportName?: string;
    terminal?: string;
    label: string;
  };

  departureTimeLabel?: string;
  arrivalTimeLabel?: string;
  durationLabel?: string;
  aircraftName?: string;
  cabinLabel?: string;
  baggageLabel?: string;
}

export interface NormalizedFlightOffer {
  id: string;
  provider: string;
  contentSource?: string;
  price: NormalizedFlightPrice;
  /** Canonical pricing block — backend-computed display/charge prices */
  pricing?: FlightOfferPricing;
  brand?: NormalizedBrand;
  cabin?: string;
  classOfService?: string;
  fareBasisCode?: string;
  totalDuration?: string;
  stops: number;
  segments: NormalizedFlightSegment[];
  baggage?: NormalizedBaggageSummary;
  display?: DisplayOfferFields;
  metadata?: {
    productRef?: string;
    productRefs?: string[];
    productSelections?: NormalizedProductSelection[];
    termsRef?: string;
    combinabilityCode?: string;
    offeringId?: string;
    /** Simple CatalogProductOffering.id (e.g. "AA_CPO0") for supplier API product selections */
    catalogOfferingId?: string;
    /** Response-level CatalogProductOfferings.Identifier.value from this offer's source provider */
    providerCatalogUuid?: string;
    /** Long-form offering identifier value from CatalogProductOffering.Identifier.value */
    offeringIdentifierValue?: string;
    /** ProductBrandOffering.Identifier.value — the brand-level offering identifier */
    brandOfferingId?: string;
    /** Duffel-specific: actual passenger IDs from the raw offer's passengers array */
    duffelPassengerIds?: string[];
    /** Duffel-specific: the offer's total_currency used for balance payment */
    duffelCurrency?: string;
    /** Duffel-specific: the offer's total_amount (decimal string) for balance payment */
    duffelTotalAmount?: string;
    /** Per-leg prices of a combined multi-city / round-trip offer, in leg
     *  order. Lets downstream stages (mapper, logs) detect mixed-currency
     *  combinations where a raw summed total would mislabel amounts.
     *  Zero behavior change: price.total stays the single conversion anchor. */
    legPrices?: Array<{ amount: number; currency: string }>;
  };
  /** Provider-neutral capability flags for this offer */
  capabilities?: FlightOfferCapabilities;
}

export interface NormalizedProductSelection {
  offeringId: string;
  productIds: string[];
}

export interface NormalizedFlightPrice {
  currency: string;
  base: number;
  taxes: number;
  total: number;
}

/**
 * Canonical pricing block for a flight offer.
 * Backend is the source of truth — frontend renders displayPrice only.
 */
export interface FlightOfferPricing {
  supplierPrice: { amount: number; currency: string };
  displayPrice: { amount: number; currency: string };
  chargePrice?: { amount: number; currency: string };
  exchangeRateSnapshot?: {
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    source: 'admin' | 'api' | 'cached';
    capturedAt: string;
  };
}

export interface NormalizedBrand {
  id: string;
  name?: string;
}

export interface NormalizedFlightSegment {
  id: string;
  carrier?: string;
  flightNumber?: string;
  operatingCarrier?: string;
  operatingCarrierName?: string;
  equipment?: string;
  duration?: string;
  stops?: number;
  departure: {
    airport?: string;
    date?: string;
    time?: string;
    terminal?: string;
  };
  arrival: {
    airport?: string;
    date?: string;
    time?: string;
    terminal?: string;
  };
  display?: DisplaySegmentFields;
}

export interface NormalizedBaggageSummary {
  carryOn?: NormalizedBaggageAllowance;
  checked?: NormalizedBaggageAllowance;
}

export interface NormalizedBaggageAllowance {
  quantity?: number;
  weightKg?: number;
  text?: string;
}
