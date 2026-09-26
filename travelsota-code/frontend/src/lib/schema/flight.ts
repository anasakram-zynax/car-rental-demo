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
  meta?: Record<string, unknown>;
}

/** Provider-neutral capability flags for a flight offer */
export interface FlightOfferCapabilities {
  seats: boolean;
  baggage: boolean;
  meals: boolean;
  services: boolean;
  cancellation: boolean;
  freeCancellation?: boolean;
}

/** Human-readable display enrichment fields sent by the backend */
export interface DisplayOfferFields {
  airlineCode?: string;
  airlineName?: string;
  airlineLogoUrl?: string;
  flightNumber?: string;
  origin: { code: string; cityName?: string; airportName?: string; label: string };
  destination: { code: string; cityName?: string; airportName?: string; label: string };
  durationLabel?: string;
  stopsLabel?: string;
  fareBrand?: string;
  cabinLabel?: string;
  baggage?: { carryOnLabel?: string; checkedLabel?: string; summaryLabel?: string };
  changePolicy?: { label: string; allowed?: boolean; penaltyAmount?: number; penaltyCurrency?: string; penaltyPercent?: number; free?: boolean };
  refundPolicy?: { label: string; allowed?: boolean; penaltyAmount?: number; penaltyCurrency?: string; penaltyPercent?: number; free?: boolean };
  supplier?: string;
  journeys?: Array<{ direction: 'outbound' | 'return' | 'itinerary'; label: string; segmentCount: number }>;
}

export interface DisplaySegmentFields {
  airlineCode?: string;
  airlineName?: string;
  airlineLogoUrl?: string;
  flightNumber?: string;
  operatingAirlineName?: string;
  origin: { code: string; cityName?: string; airportName?: string; terminal?: string; label: string };
  destination: { code: string; cityName?: string; airportName?: string; terminal?: string; label: string };
  departureTimeLabel?: string;
  arrivalTimeLabel?: string;
  durationLabel?: string;
  aircraftName?: string;
  cabinLabel?: string;
  baggageLabel?: string;
}

export interface FlightOfferView {
  offerId: string;
  productId: string;
  productIds?: string[];
  /** Provider key (travelport, duffel, etc.) */
  provider?: string;
  /** Travelport content channel this offer came from ('NDC' | 'GDS') */
  contentSource?: string;
  productSelections?: Array<{
    offeringId: string;
    productIds: string[];
  }>;
  catalogUuid: string;
  offeringIdentifierValue?: string;
  brandOfferingId?: string;
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
    displayPrice: { amount:
      number; currency: string };
    /** RAW base + markup in DISPLAY currency — card breakdown (single currency) */
    supplierBaseInDisplay?: number;
    markupInDisplay?: number;
    chargePrice?: { amount: number; currency: string };
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
  /** Provider-neutral capability flags */
  capabilities?: FlightOfferCapabilities;
  /** Display enrichment from backend (airline/airport names, logos, labels) */
  display?: DisplayOfferFields;
  /**
   * Return-leg metadata for combined round-trip offers.
   * When the search page pairs outbound + return legs into a single display
   * offer, these fields carry the return leg's identifiers so the backend
   * can cache both legs for Travelport pricing.
   */
  returnOfferId?: string;
  returnProductId?: string;
  returnProductIds?: string[];
  returnCatalogUuid?: string;
  returnProductSelections?: Array<{ offeringId: string; productIds: string[] }>;
}

export interface FlightSegmentView {
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  marketingCarrier?: string;
  flightNumber?: string;
  /** Display enrichment from backend (airline/airport names, logos, labels) */
  display?: DisplaySegmentFields;
}
