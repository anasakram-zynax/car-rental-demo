export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ── Combined Supplier Search Response ─────────────────────────────
// Matches backend CombinedHotelCard + CombinedHotelSearchResponse.

export interface ProviderSearchResult {
  provider: string;
  status: "ok" | "failed" | "timeout";
  errorCode?: string;
  errorMessage?: string;
  hotelCount?: number;
  elapsedMs?: number;
}

export interface ProviderWarning {
  provider: string | null;
  code: string;
  message: string;
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
    cancellationPolicies?: HotelCancellationPolicy[];
  };
  rateCount?: number;
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
    supplierPrice?: number;
    markupPercent?: number;
    /** RAW base + markup in DISPLAY currency — card breakdown (single currency) */
    supplierBaseInDisplay?: number;
    markupInDisplay?: number;
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

  // Enriched fields from HotelContentEnrichmentService (optional, populated when enrichment applies)
  primaryImageUrl?: string;
  amenitiesPreview?: string[];
  descriptionShort?: string;
  contentCompleteness?: "full" | "partial" | "missing";
  enrichmentStatus?:
    | "enriched"
    | "partial"
    | "missing"
    | "no_providers"
    | "disabled";
}

export interface CombinedHotelSearchResponse {
  searchKey: string;
  createdAt: string;
  expiresAt: string;
  warnings: ProviderWarning[];
  hotels: CombinedHotelCard[];
  providerResults: ProviderSearchResult[];
  meta?: {
    total?: number;
    pagination?: PaginationMeta;
  };
}

// ── Legacy Hotelbeds Search View (kept for backward compat) ───────
// @deprecated Use CombinedHotelCard + CombinedHotelSearchResponse

export interface HotelOfferView {
  hotelId: string;
  provider?: string;
  providerHotelId?: string;
  name: string;
  destinationCode?: string;
  destinationName?: string;
  zoneName?: string;
  categoryName?: string;
  latitude?: string;
  longitude?: string;
  roomsCount: number;
  minRate?: {
    provider?: string;
    currency?: string;
    total: number;
    rateId?: string;
    rateKey?: string;
    boardName?: string;
    paymentType?: string;
    cancellationPolicyText?: string;
  };
  rates: HotelRateView[];
}

export interface HotelSearchView {
  provider: string;
  hotels: HotelOfferView[];
  searchKey?: string;
  meta?: {
    total?: number;
    checkIn?: string;
    checkOut?: string;
    pagination?: PaginationMeta;
  };
}

export interface HotelCancellationPolicy {
  amount?: string | number;
  from?: string;
  to?: string;
  deadline?: string;
  policyType?: string;
  percentage?: string | number;
  numberOfNights?: number;
}

/** Aggregated policy — the unified shape the frontend consumes. */
export interface AggregatedPolicy {
  refundable: boolean;
  freeCancellationUntil: string | null;
  cancellationFee: number | null;
  feeType: 'flat' | 'percentage' | 'nights' | null;
  modificationAllowed: boolean;
  displayText: string;
  rateComments: string;
  rawPolicies: HotelCancellationPolicy[];
  supplier: string;
}

export interface HotelRateView {
  rateId: string;
  rateKey?: string;
  provider?: string;
  providerHotelId?: string;
  roomName?: string;
  boardName?: string;
  paymentType?: string;
  net: number;
  currency?: string;
  cancellationPolicyText?: string;
  cancellationPolicies?: HotelCancellationPolicy[];
  refundable?: boolean;
}

export interface HotelMinRateView {
  provider?: string;
  currency?: string;
  total: number;
  rateId?: string;
  rateKey?: string;
  boardName?: string;
  paymentType?: string;
  cancellationPolicyText?: string;
  refundable?: boolean;
}
