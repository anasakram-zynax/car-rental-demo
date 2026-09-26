/**
 * Canonical persisted snapshot of a selected flight offer.
 *
 * Created when the user clicks "Select" on a flight card. Every downstream
 * step (detail page, reprice, hold, ticketing) reads from this single
 * snapshot — never from URL params, stale cache, or fallback search data.
 */

export type FlightOfferSnapshotProvider = 'travelport' | 'duffel' | 'amadeus' | 'manual';
export type FlightOfferSnapshotTripType = 'one_way' | 'round_trip' | 'multi_city';
export type FlightOfferSnapshotContentSource = 'GDS' | 'NDC';

/**
 * Manual (seed/demo inventory) offers carry no supplier identifiers — the
 * persisted offer/pricing payload IS the source of truth. Checkout settles
 * locally without supplier calls.
 */
export interface ManualSupplierContext {
  contentSource: string;
}

/**
 * Travelport-specific supplier context stored in the snapshot.
 * Contains every identifier needed to reprice / hold / ticket later.
 */
export interface TravelportSupplierContext {
  contentSource: string;
  catalogUuid: string;
  offeringId: string;
  productIds: string[];
  productSelections?: Array<{ offeringId: string; productIds: string[] }>;
  authority?: string;
  referenceList: {
    products: Record<string, any>;
    flights: Record<string, any>;
    brands?: Record<string, any>;
  };
  travelportSessionId?: string;
  searchRepresentation?: string;
  pcc?: string;
  accessGroup?: string;
  validatingCarrier?: string;
  fareFamily?: string;
  termsAndConditions?: any;
  baggage?: any;
  penalties?: any;
  workflowKind?: string;
  capabilities?: any;
  passengerCriteria?: Array<{ number: number; passengerTypeCode: string }>;
  searchCriteria?: {
    from: string;
    to: string;
    departureDate: string;
    tripType?: string;
    returnDate?: string;
    cabinClass?: string;
    adults: number;
  };
  combinabilityCode?: string;
  brandOfferingId?: string;
  offeringIdentifierValue?: string;
}

/**
 * Duffel-specific supplier context stored in the snapshot.
 */
export interface DuffelSupplierContext {
  offerId: string;
  slices: any[];
  passengers: any[];
  expiresAt: string;
  availableServices?: any[];
  rawOffer: any;
  /** Search criteria from the original search (adults count, route, dates) */
  searchCriteria?: { adults?: number };
}

/**
 * Amadeus-specific supplier context stored in the snapshot.
 */
export interface AmadeusSupplierContext {
  offerId: string;
  rawOffer: any;
  searchCriteria?: {
    from?: string;
    to?: string;
    departureDate?: string;
    tripType?: string;
    returnDate?: string;
    cabinClass?: string;
    adults?: number;
  };
}

export type SupplierContext = TravelportSupplierContext | DuffelSupplierContext | AmadeusSupplierContext | ManualSupplierContext;

export interface FlightOfferSnapshotEntity {
  id: string;
  provider: FlightOfferSnapshotProvider;
  userId?: string;
  agentId?: string;
  searchKey: string;
  offerId: string;
  tripType: FlightOfferSnapshotTripType;
  contentSource?: FlightOfferSnapshotContentSource;
  supplierContext: SupplierContext;
  normalizedOffer: Record<string, any>;
  pricingSnapshot: Record<string, any>;
  expiresAt: string;
  createdAt: string;
}

export interface CreateFlightOfferSnapshotInput {
  provider: FlightOfferSnapshotProvider;
  userId?: string;
  agentId?: string;
  searchKey: string;
  offerId: string;
  tripType: FlightOfferSnapshotTripType;
  contentSource?: FlightOfferSnapshotContentSource;
  supplierContext: SupplierContext;
  normalizedOffer: Record<string, any>;
  pricingSnapshot: Record<string, any>;
  expiresAt: string;
}

/**
 * Validate that a Travelport supplier context has all required identifiers
 * for downstream reprice/hold/ticket operations.
 *
 * Returns true if the context is complete, false otherwise.
 */
export function isTravelportContextComplete(
  ctx: SupplierContext,
): ctx is TravelportSupplierContext {
  if (!ctx || typeof ctx !== 'object') return false;
  const c = ctx as Record<string, any>;
  return (
    typeof c.contentSource === 'string' &&
    typeof c.catalogUuid === 'string' &&
    typeof c.offeringId === 'string' &&
    Array.isArray(c.productIds) &&
    c.productIds.length > 0 &&
    c.referenceList != null &&
    typeof c.referenceList === 'object' &&
    typeof c.referenceList.products === 'object' &&
    typeof c.referenceList.flights === 'object'
  );
}

/**
 * Validate that a Duffel supplier context is complete.
 */
export function isDuffelContextComplete(
  ctx: SupplierContext,
): ctx is DuffelSupplierContext {
  if (!ctx || typeof ctx !== 'object') return false;
  const c = ctx as Record<string, any>;
  return (
    typeof c.offerId === 'string' &&
    Array.isArray(c.slices) &&
    c.slices.length > 0
  );
}

/**
 * Validate that an Amadeus supplier context is complete.
 */
export function isAmadeusContextComplete(
  ctx: SupplierContext,
): ctx is AmadeusSupplierContext {
  if (!ctx || typeof ctx !== 'object') return false;
  const c = ctx as Record<string, any>;
  return typeof c.offerId === 'string' && c.rawOffer != null;
}
