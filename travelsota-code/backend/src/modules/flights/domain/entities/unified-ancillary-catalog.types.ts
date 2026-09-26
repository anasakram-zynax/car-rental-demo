/**
 * Unified Ancillary Catalog Types
 *
 * These types define the strict backend contract that ALL providers (Duffel, Travelport, Sabre, etc.)
 * must return. The frontend ONLY uses these types — it never touches provider-specific data.
 *
 * Architecture:
 *   ProviderAdapter.getCatalog() → UnifiedAncillaryCatalog
 *   /flights/ancillaries/catalog → UnifiedAncillaryCatalog
 *   React renders unified types only
 */

// ── Primitives ──

export interface Money {
  amount: number;
  currency: string;
}

/**
 * Canonical ancillary pricing — mirrors the backend PricingBreakdown shape.
 * When `displayPrice` is provided, frontend should prefer it for display.
 * When absent, `supplierPrice` is used as-is (no conversion available).
 */
export interface AncillaryPricing {
  supplierPrice: Money;
  displayPrice?: Money;
  chargePrice?: Money;
}

export interface SupplierRef {
  provider: string;
  /** Raw provider-specific identifiers for booking/refresh */
  raw?: Record<string, unknown>;
}

/**
 * Catalog lifecycle status — drives loading/ready/partial/unavailable/error UI states.
 */
export type CatalogStatus = 'loading' | 'ready' | 'partial' | 'unavailable' | 'error';

// ── Seat Map ──

export type SeatElementType = 'seat' | 'aisle' | 'empty' | 'lavatory' | 'galley' | 'exit' | 'wing';

export type SeatSelectionMode = 'preBookingSelectable' | 'postBookingOnly' | 'requestOnly' | 'unavailable';

export interface UnifiedSeatElement {
  type: SeatElementType;
  seatNumber?: string;
  column?: string;
  available: boolean;
  pricing: AncillaryPricing;
  features: string[];
  supplierRef?: SupplierRef;
}

export interface UnifiedSeatRow {
  rowNumber: number;
  elements: UnifiedSeatElement[];
}

export interface UnifiedSeatCabin {
  cabinClass: string;
  deck?: string;
  rows: UnifiedSeatRow[];
}

export interface UnifiedSeatMap {
  segmentId: string;
  segmentIndex: number;
  origin?: string;
  destination?: string;
  departureAt?: string;
  arrivalAt?: string;
  cabinClass?: string;
  cabins: UnifiedSeatCabin[];
}

// ── Baggage ──

export type BaggageType = 'checked' | 'carry_on' | 'personal_item';

export interface IncludedBaggage {
  id?: string;
  passengerIndex?: number;
  passengerRef?: string;
  segmentIndex?: number;
  segmentRef?: string;
  journeyRef?: string;
  type?: BaggageType;
  quantity?: number;
  weightKg?: number;
  dimensions?: string;
  label?: string;
  /** Human-readable summary label for UI display (e.g. "Carry-on + Checked bag") */
  summaryLabel?: string;
  carryOnLabel?: string;
  checkedLabel?: string;
  pieces?: Array<{
    type: 'carry_on' | 'checked';
    maxWeightKg?: number;
    maxDimensionsCm?: string;
  }>;
}

export interface PaidBaggage {
  id: string;
  type: BaggageType;
  label: string;
  description?: string;
  pricing: AncillaryPricing;
  maxQuantity: number;
  passengerIndex?: number;
  passengerRef?: string;
  segmentIndex?: number;
  segmentRef?: string;
  journeyRef?: string;
  passengerRefs?: string[];
  segmentRefs?: string[];
  supplierRef: SupplierRef;
}

// ── Meals ──

export type MealSelectionMode = 'preBookingSelectable' | 'requestOnly' | 'unavailable';

export interface UnifiedMealOption {
  id: string;
  mealName: string;
  mealCode: string;
  dietaryType: string;
  description: string;
  pricing: AncillaryPricing;
  selectionMode: MealSelectionMode;
  supplierRef?: SupplierRef;
}

// ── Extra Services ──

export type ServiceType = 'priority' | 'lounge' | 'wifi' | 'sports_equipment' | 'pet' | 'other';

export interface UnifiedExtraService {
  id: string;
  type: ServiceType;
  label: string;
  description?: string;
  pricing: AncillaryPricing;
  maxQuantity?: number;
  supplierRef: SupplierRef;
}

// ── Passengers ──

export interface AncillaryPassenger {
  index: number;
  name?: string;
  passengerType?: string;
  /** Supplier-specific passenger identifier for ancillary requests */
  supplierPassengerId?: string;
}

// ── Capabilities ──

export interface AncillaryCapabilities {
  seatMap: boolean;
  paidBaggage: boolean;
  includedBaggage: boolean;
  meals: boolean;
  services: boolean;
  /** If true, seat selection is only available after PNR is created */
  postBookingOnly?: boolean;
}

// ── Unavailable Reasons ──

export interface AncillaryUnavailable {
  seats?: string;
  paidBaggage?: string;
  includedBaggage?: string;
  meals?: string;
  services?: string;
}

// ── Source Tag ──

export type AncillarySource = 'seat_map' | 'baggage_shop' | 'included_fare' | 'ssr' | 'special_service';

// ── Main Response ──

export interface UnifiedAncillaryCatalog {
  ok: boolean;
  /** Explicit catalog lifecycle status — drives frontend loading/ready/partial/unavailable/error states */
  status: CatalogStatus;
  provider: string;
  offerId: string;
  searchKey?: string;
  expiresAt?: string;

  seats: UnifiedSeatMap[];
  baggage: {
    included: IncludedBaggage[];
    paid: PaidBaggage[];
  };
  meals: UnifiedMealOption[];
  services: UnifiedExtraService[];

  passengers: AncillaryPassenger[];
  unavailable: AncillaryUnavailable;

  capabilities: AncillaryCapabilities;
}

// ── Input Types ──

export interface AncillaryCatalogInput {
  searchKey: string;
  offerId: string;
  travelerCount: number;
  /** Per-passenger identity (index + traveler type). When absent, travelerCount generic fallback is used. */
  travelers?: Array<{ index: number; type: string }>;
  provider?: string;
  includedBaggageLabel?: string;
  snapshotId?: string;
  /** Display currency for price conversion (e.g. "USD", "EUR") */
  displayCurrency?: string;
}

export interface SeatRefreshInput {
  searchKey: string;
  offerId: string;
  workbenchId: string;
  sessionId?: string;
  selectedSeats: Array<{
    seatNumber: string;
    passengerIndex: number;
    segmentIndex?: number;
    segmentRef?: string;
  }>;
}

export interface SeatRefreshResult {
  ok: boolean;
  refreshedSeats: Array<{
    seatNumber: string;
    passengerIndex: number;
    available: boolean;
    supplierRef?: SupplierRef;
  }>;
}

export interface AddServicesInput {
  workbenchId: string;
  sessionId?: string;
  offerIdentifierValue: string;
  travelerIdMapping: Record<number, string>;
  seats?: Array<{
    seatNumber: string;
    passengerIndex: number;
    segmentIndex?: number;
    supplierRef: SupplierRef;
  }>;
  baggage?: Array<{
    id: string;
    passengerIndex: number;
    supplierRef: SupplierRef;
  }>;
  meals?: Array<{
    mealCode: string;
    passengerIndex: number;
    supplierRef?: SupplierRef;
  }>;
  services?: Array<{
    id: string;
    passengerIndex: number;
    supplierRef: SupplierRef;
  }>;
}

export interface AddServicesResult {
  ok: boolean;
  seatsAdded: number;
  seatsFailed: number;
  baggageAdded: number;
  baggageFailed: number;
  mealsAdded: number;
  mealsFailed: number;
  servicesAdded: number;
  servicesFailed: number;
  errors: string[];
}

// ── Provider Adapter Interface ──

export interface FlightAncillaryProvider {
  readonly provider: string;

  /**
   * Build the unified ancillary catalog for an offer.
   * This is the main entry point — each provider normalizes its own data into the unified shape.
   */
  getCatalog(input: AncillaryCatalogInput): Promise<UnifiedAncillaryCatalog>;

  /**
   * Refresh seat availability for the active booking workbench.
   * Used during final booking to get fresh seat identifiers.
   * Returns null if seat refresh is not supported or fails.
   */
  refreshSeatForBooking?(input: SeatRefreshInput): Promise<SeatRefreshResult | null>;

  /**
   * Add post-booking services (baggage, meals, extra services).
   * Called after PNR is created and committed.
   */
  addPostBookingServices?(input: AddServicesInput): Promise<AddServicesResult>;
}
