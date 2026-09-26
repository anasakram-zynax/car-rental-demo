export interface PolicyView {
  label: string;
  allowed?: boolean;
  penaltyAmount?: number;
  penaltyCurrency?: string;
  penaltyPercent?: number;
  free?: boolean;
}

export interface FlightLocationView {
  code: string;
  cityName?: string;
  airportName?: string;
  terminal?: string;
  timezone?: string;
  label: string;
}

export interface FlightSegmentDetailView {
  segmentIndex: number;
  airlineCode?: string;
  airlineName?: string;
  airlineLogoUrl?: string;
  flightNumber?: string;
  operatingAirlineName?: string;
  aircraftCode?: string;
  aircraftName?: string;

  departure: {
    location: FlightLocationView;
    date: string;
    time: string;
  };

  arrival: {
    location: FlightLocationView;
    date: string;
    time: string;
  };

  durationLabel?: string;
  cabin?: string;
  cabinMarketingName?: string;
  fareBasisCode?: string;
  classOfService?: string;
  baggageLabel?: string;

  layoverAfter?: {
    location: FlightLocationView;
    durationLabel: string;
    overnight?: boolean;
  };
}

export interface FlightJourneyDetailView {
  direction: 'outbound' | 'return' | 'itinerary';
  label: string;
  durationLabel?: string;
  segments: FlightSegmentDetailView[];
}

export interface FlightBaggagePerSegment {
  segmentIndex: number;
  label: string;
  included?: boolean;
  quantity?: number;
  weightText?: string;
}

export interface FlightOfferDetailView {
  offerId: string;
  provider: 'duffel' | 'travelport' | 'amadeus';
  searchKey?: string;
  catalogUuid?: string;

  route: {
    from: FlightLocationView;
    to: FlightLocationView;
    tripType: 'one_way' | 'round_trip';
    totalDurationLabel?: string;
    stopsLabel?: string;
  };

  airline: {
    code?: string;
    name?: string;
    logoUrl?: string;
    operatingAirlineName?: string;
    conditionsOfCarriageUrl?: string;
  };

  pricing: {
    baseAmount?: number;
    taxAmount?: number;
    feesAmount?: number;
    supplierTotal?: number;
    customerTotal?: number;
    currency: string;
    displayCurrency?: string;
    priceChanged?: boolean;
    priceLastCheckedAt?: string;
    paymentRequiredBy?: string;
    priceGuaranteeExpiresAt?: string;
    offerExpiresAt?: string;
  };

  journeys: FlightJourneyDetailView[];

  baggage?: {
    summaryLabel?: string;
    carryOnLabel?: string;
    checkedLabel?: string;
    perSegment?: FlightBaggagePerSegment[];
  };

  fare: {
    cabin?: string;
    cabinMarketingName?: string;
    fareBrand?: string;
    fareBasisCode?: string;
    classOfService?: string;
    changePolicy?: PolicyView;
    refundPolicy?: PolicyView;
  };

  passengerRequirements?: {
    identityDocumentsRequired?: boolean;
    supportedIdentityDocumentTypes?: string[];
    supportedLoyaltyProgrammes?: string[];
  };

  amenities?: {
    wifi?: string;
    power?: string;
    seatPitch?: string;
    seatType?: string;
  };

  adminDebug?: {
    provider?: string;
    contentSource?: string;
    productIds?: string[];
    offeringId?: string;
    catalogUuid?: string;
    fareBasisCode?: string;
    classOfService?: string;
  };
}
