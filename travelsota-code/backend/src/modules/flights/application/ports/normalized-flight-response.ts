export interface FlightSegmentView {
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  marketingCarrier?: string;
  flightNumber?: string;
  display?: {
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
  };
}

/** Provider-neutral capability flags passed to frontend */
export interface FlightOfferCapabilitiesView {
  seats: boolean;
  baggage: boolean;
  meals: boolean;
  services: boolean;
  cancellation: boolean;
  freeCancellation?: boolean;
}

export interface FlightOfferView {
  offerId: string;
  productId: string;
  productIds?: string[];
  /** Provider key (travelport, duffel, etc.) */
  provider?: string;
  /** Travelport content channel this offer came from ('NDC' | 'GDS') — used
   *  for result-card badges and to route booking workflows per channel. */
  contentSource?: string;
  productSelections?: Array<{
    offeringId: string;
    productIds: string[];
  }>;
  offeringIdentifierValue?: string;
  catalogUuid: string;
  price: {
    currency: string;
    total: number;
    minorUnit?: number;
    supplierPrice?: number;
    markupPercent?: number;
  };
  /** Canonical pricing block — backend-computed display/charge prices */
  pricing?: {
    supplierPrice: { amount: number; currency: string };
    displayPrice: { amount: number; currency: string };
    chargePrice?: { amount: number; currency: string };
    /** RAW supplier base + markup converted to display currency (card breakdown) */
    supplierBaseInDisplay?: number;
    markupInDisplay?: number;
    exchangeRateSnapshot?: {
      fromCurrency: string;
      toCurrency: string;
      rate: number;
      source: 'admin' | 'api' | 'cached';
      capturedAt: string;
    };
  };
  cabin?: string;
  brandName?: string;
  stops?: number;
  segments: FlightSegmentView[];
  refundable?: boolean;
  changeable?: boolean;
  baggageText?: string;
  display?: {
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
    supplier?: string;
  };
  /** Provider-neutral capability flags */
  capabilities?: FlightOfferCapabilitiesView;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface FlightSearchView {
  searchKey: string;
  offers: FlightOfferView[];
  pagination: PaginationMeta;
  warnings?: string[];
  meta?: {
    catalogUuid?: string;
    providerContexts?: Record<string, unknown>;
    referenceList?: Record<string, unknown>;
    providerResults?: Record<string, unknown>[];
    providerMeta?: Record<string, unknown>;
  };
}

export interface BookingPreviewView {
  bookingId: string;
  amount: number;
  currency: string;
  displayAmount: number;
  displayCurrency: string;
  displayExchangeRate: number | null;
  status: string;
  next: 'payment';
}

export interface BookingCheckoutView {
  bookingId: string;
  paymentId: string;
  amount: number;
  currency: string;
  clientSecret: string | null;
  checkoutUrl: string | null;
}

export interface BookingConfirmView {
  bookingId: string;
  status: string;
  locatorCode?: string;
  workbenchId?: string;
  reservationId?: string;
}

export interface BookingDetailView {
  id: string;
  provider: string;
  status: string;
  /** Real Payment record status (PENDING/AUTHORIZED/PAID/REFUNDED/CANCELLED) — independent of `status` above. */
  paymentStatus?: string | null;
  amount: number | null;
  currency: string | null;
  locatorCode?: string;
  workbenchId?: string;
  reservationId?: string;
  createdAt: string;
  updatedAt: string;
  message?: string;
  offerSnapshot?: Record<string, unknown> | null;
  travelerSnapshot?: Array<Record<string, unknown>> | null;
  workflowSummary?: unknown;
}
