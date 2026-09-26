// ── Provider Status ───────────────────────────────────────────────

export interface ProviderWarning {
  provider: string | null;
  code: string;
  message: string;
}

export interface ProviderStatus {
  ok: boolean;
  provider: string;
  upstreamStatus?: number;
  upstreamResponse?: unknown;
}

// ── Search Aggregator Types (Phase 3) ─────────────────────────────

export interface ProviderSearchResult {
  provider: string;
  status: 'ok' | 'failed' | 'timeout' | 'skipped';
  errorCode?: string;
  errorMessage?: string;
  hotelCount?: number;
  elapsedMs?: number;
}

export interface HotelSearchSession {
  searchKey: string;
  createdAt: string;
  expiresAt: string;
  criteria: Record<string, unknown>;
  providers: Record<string, ProviderSearchResult>;
}

export interface CombinedHotelCard {
  hotelGroupId: string;
  displayName: string;
  location?: {
    latitude?: number;
    longitude?: number;
    city?: string;
    country?: string;
  };
  starRating?: number;
  guestRating?: number;
  images?: string[];
  amenities?: string[];
  providers: HotelProviderSummary[];
  minPrice?: {
    amount: number;
    currency: string;
  };
  /** Canonical pricing block — backend-computed display/charge prices */
  pricing?: {
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
  };
}

export interface HotelProviderSummary {
  provider: string;
  providerHotelId: string;
  available: boolean;
  minRate?: {
    rateId: string;
    total: number;
    currency?: string;
    boardName?: string;
    supplierPrice?: number;
    markupPercent?: number;
    adults?: number;
    children?: number;
    refundable?: boolean;
    cancellationPolicyText?: string;
    cancellationPolicies?: Array<{
      amount?: string | number;
      from?: string;
      to?: string;
      deadline?: string;
      policyType?: string;
      percentage?: string | number;
      numberOfNights?: number;
    }>;
  };
  rateCount?: number;
}

export interface CombinedHotelSearchResponse {
  searchKey: string;
  createdAt: string;
  expiresAt: string;
  warnings: ProviderWarning[];
  hotels: CombinedHotelCard[];
  providerResults: ProviderSearchResult[];
}

// ── RgExt Data (RateHawk room grade data) ──────────────────────────

/** Room grade data used for matching live rates to static room content */
export interface RgExtData {
  class?: number;
  quality?: number;
  bathroom?: number;
  bedding?: number;
}

// ── Search Input / Output ─────────────────────────────────────────

export interface HotelSearchInput {
  checkIn: string;
  checkOut: string;
  destinationCode?: string;
  destinationName?: string;
  hotelCodes?: Array<number | string>;
  hotelName?: string;
  geolocation?: {
    latitude: number;
    longitude: number;
    radius: number;
  };
  rooms?: Array<{
    adults: number;
    children: number;
    childAges?: number[];
  }>;
  minRate?: number;
  maxRate?: number;
  minCategory?: number;
  maxCategory?: number;
  paymentType?: string;
  maxRatesPerRoom?: number;
  page?: number;
  pageSize?: number;
  /** Display currency for pricing blocks (Phase 4) */
  currency?: string;
}

export interface NormalizedHotelSearchResponse {
  provider: string;
  hotels: NormalizedHotelSummary[];
  meta: {
    checkIn?: string;
    checkOut?: string;
    total: number;
    pagination?: PaginationMeta;
  };
}

export interface NormalizedHotelSummary {
  hotelId: string;
  providerHotelId: string;
  name: string;
  destinationCode?: string;
  destinationName?: string;
  zoneName?: string;
  categoryName?: string;
  latitude?: string;
  longitude?: string;
  images?: string[];
  amenities?: string[];
  minRate?: {
    rateId: string;
    total: number;
    currency?: string;
    boardName?: string;
    paymentType?: string;
    cancellationPolicyText?: string;
    refundable?: boolean;
    cancellationPolicies?: Array<{
      amount?: string | number;
      from?: string;
      to?: string;
      deadline?: string;
      policyType?: string;
      percentage?: string | number;
      numberOfNights?: number;
    }>;
    adults?: number;
    children?: number;
  };
  rates?: NormalizedHotelRate[];
  roomsCount?: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ── Hotel Details / Rates ─────────────────────────────────────────

export interface HotelDetailsInput {
  searchKey: string;
  hotelId: string;
}

/** Extended details input for multi-provider orchestration */
export interface ExtendedHotelDetailsInput {
  searchKey: string;
  hotelGroupId: string;
  provider?: string;
}

export interface NormalizedHotelDetailsResponse {
  provider: string;
  searchKey: string;
  hotelId: string;
  providerHotelId: string;
  name: string;
  images?: string[];
  amenities?: string[];
  description?: string;
  address?: string;
  checkIn?: string;
  checkOut?: string;
  rates: NormalizedHotelRate[];
}

export interface NormalizedHotelRate {
  rateId: string;
  roomName?: string;
  boardName?: string;
  paymentType?: string;
  supplierAmount: number;
  supplierCurrency?: string;
  customerAmount?: number;
  customerCurrency?: string;
  cancellationPolicyText?: string;
  refundable?: boolean;
  /** Full structured cancellation policies from the supplier. */
  cancellationPolicies?: Array<{
    amount?: string | number;
    from?: string;
    to?: string;
    deadline?: string;
    policyType?: string;
    percentage?: string | number;
    numberOfNights?: number;
  }>;
  providerPayloadRef?: string;
  /** Legacy Hotelbeds-specific rateKey — will be deprecated */
  rateKey?: string;
  /** Room grade data (RateHawk rg_ext) for matching live rates to static room content */
  rgExt?: RgExtData;

  /** Provider room code — Hotelbeds room.code, RateHawk room identifier */
  roomCode?: string;

  /** Stable room key for grouping — provider+code hash or rg_ext hash */
  roomKey?: string;

  /** Occupancy this rate was priced for (from supplier response). */
  adults?: number;
  children?: number;
}

// ── Combined Details Response (Phase 7) ───────────────────────────

import type { PricingBreakdown } from '../../../../shared/helpers/pricing.types';

export interface HotelRateView {
  provider: string;
  providerHotelId: string;
  rateId: string;
  roomName: string;
  boardName?: string;
  refundable?: boolean;
  cancellationPolicy?: string;
  /**
   * Full structured cancellation policies from the supplier. `amount` starts
   * in the supplier's currency; the details orchestrator converts it to the
   * requested display currency and sets `currency` accordingly (see
   * `HotelDetailsOrchestratorService.convertCancellationPolicies`). Until
   * that conversion runs, `currency` is absent and `amount` should be
   * treated as the raw supplier amount.
   */
  cancellationPolicies?: Array<{
    amount?: string | number;
    currency?: string;
    from?: string;
    to?: string;
    deadline?: string;
    policyType?: string;
    percentage?: string | number;
    numberOfNights?: number;
  }>;
  occupancy?: {
    adults: number;
    children: number;
  };
  supplierPrice: {
    amount: number;
    currency: string;
  };
  customerPrice?: {
    amount: number;
    currency: string;
  };
  /** Backend-computed pricing breakdown with display/charge conversion.
   *  When present, frontend should use pricing.displayPrice for display. */
  pricing?: PricingBreakdown;
  /** Room grade data for matching live rates to static room content */
  rgExt?: RgExtData;

  /** Provider room code — Hotelbeds room.code, RateHawk room identifier */
  roomCode?: string;

  /** Stable room key for grouping — derived from rgExt, roomCode, or roomName */
  roomKey?: string;
}

export interface HotelProviderRateSection {
  provider: string;
  providerHotelId: string;
  status: 'available' | 'unavailable' | 'failed';
  rates: HotelRateView[];
}

export interface HotelContentView {
  hotelGroupId: string;
  displayName: string;
  location?: {
    latitude?: number;
    longitude?: number;
    city?: string;
    country?: string;
  };
  starRating?: number;
  images?: string[];
  amenities?: string[];
  description?: string;
  address?: string;
}

export interface CombinedHotelDetailsResponse {
  searchKey: string;
  hotelGroupId: string;
  hotel: HotelContentView;
  providerSections: HotelProviderRateSection[];
  warnings: ProviderWarning[];
}

// ── Rate Validation ───────────────────────────────────────────────

export interface HotelRateValidationInput {
  rateId: string;
  /** Search context for provider-specific prebook/validation (Phase 7) */
  searchKey?: string;
  providerHotelId?: string;
  checkIn?: string;
  checkOut?: string;
  rooms?: Array<{
    adults: number;
    children: number;
    childAges?: number[];
  }>;
}

export interface ValidatedHotelRate {
  rateId: string;
  provider: string;
  supplierAmount: number;
  supplierCurrency: string;
  /** @deprecated Use supplierCurrency */
  currency?: string;
  customerAmount?: number;
  customerCurrency?: string;
  prebookToken?: string;
  prebookExpiresAt?: string;
  rooms: Array<{
    rates: Array<{
      rateKey: string;
      net: number;
      adults?: number;
      children?: number;
      cancellationPolicies?: Array<{
        amount?: string | number;
        from?: string;
        to?: string;
        deadline?: string;
        policyType?: string;
        percentage?: string | number;
        numberOfNights?: number;
      }>;
      /** Refundable verdict when the supplier stated one (undefined = unknown). */
      refundable?: boolean;
      cancellationPolicyText?: string;
      /** Supplier rate comments / terms text (Travelport TextBlock, etc.). */
      rateComments?: string;
      guaranteeType?: string;
      /** Where the policy data came from. */
      policySource?: 'supplier_rules' | 'availability' | 'unknown';
    }>;
  }>;
  raw?: unknown;
}

// ── Booking ───────────────────────────────────────────────────────

export interface HotelCreateBookingInput {
  rateId: string;
  holder: Record<string, unknown>;
  clientReference: string;
  paxes: Record<string, unknown>[];
  roomAdults?: number;
  roomChildren?: number;
  tolerance?: number;
  partnerOrderId?: string;
  userIp?: string;
}

export interface HotelSupplierBookingResult {
  provider: string;
  booking: {
    reference: string;
    /** partner_order_id used for status polling (RateHawk) */
    partnerOrderId?: string;
    status: string;
    holder: Record<string, unknown>;
    hotel: {
      hotelId: string;
      name: string;
      checkIn?: string;
      checkOut?: string;
      destinationName?: string;
      zoneName?: string;
    } | null;
    rooms: Array<Record<string, unknown>>;
    price: {
      totalNet: number | null;
      pendingAmount?: number | null;
      currency?: string | null;
    };
    cancellationAllowed?: boolean;
    modificationAllowed?: boolean;
  } | null;
  raw?: unknown;
}

// ── Booking Status ────────────────────────────────────────────────

export interface HotelBookingStatusInput {
  supplierReference: string;
}

export interface HotelSupplierBookingStatus {
  provider: string;
  reference: string;
  status: string;
  supplierStatus?: string;
}

// ── Retrieve Booking ──────────────────────────────────────────────

export interface HotelRetrieveBookingInput {
  reference: string;
}

export type HotelSupplierBookingDetails = HotelSupplierBookingResult;

// ── Cancel Booking ────────────────────────────────────────────────

export interface HotelCancelBookingInput {
  bookingId?: string;
  reference: string;
  reason?: string;
}

export interface HotelSupplierCancelResult {
  provider: string;
  reference: string;
  status: string;
  message?: string;
  raw?: unknown;
}

// ── Change (modify) Booking ─────────────────────────────────────

export interface HotelChangeBookingInput {
  /** Local booking id when available */
  bookingId?: string;
  /** Supplier reference of the booking to change */
  reference: string;
  /** SIMULATION (preview change) or BOOKING (commit) */
  mode: 'SIMULATION' | 'BOOKING';
  /** Fields to change — only provided fields are sent upstream */
  changes?: {
    checkIn?: string;
    checkOut?: string;
    holder?: { name?: string; surname?: string };
  };
  /**
   * Raw supplier booking payload to send as the change body base.
   * When provided the provider skips its own retrieve. Used for the
   * BOOKING commit so the payload carries the re-priced values returned
   * by the preceding SIMULATION call.
   */
  baseBooking?: unknown;
}

export interface HotelSupplierChangeResult {
  provider: string;
  reference: string;
  /** supplier booking status after the change */
  status: string;
  changeable: boolean;
  message?: string;
  /** normalized booking payload returned by the change call */
  booking?: HotelSupplierBookingResult['booking'];
  raw?: unknown;
}
