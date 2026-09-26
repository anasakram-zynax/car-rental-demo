import { Test } from '@nestjs/testing';
import { FlightOfferDetailViewMapper } from './flight-offer-detail-view.mapper';
import { PrismaReferenceDataRepository } from '../../infrastructure/reference-data/prisma-reference-data.repository';
import type { NormalizedFlightOffer, NormalizedFlightSegment, SelectedOfferCacheEntry } from '../../domain/entities/flight-search-response';

// ─── Factories ────────────────────────────────────────────────

function makeSegment(overrides?: Partial<NormalizedFlightSegment>): NormalizedFlightSegment {
  return {
    id: 'seg_1',
    carrier: 'BA',
    flightNumber: 'BA178',
    operatingCarrier: 'BA',
    operatingCarrierName: 'British Airways',
    equipment: '777',
    duration: 'PT12H',
    stops: 0,
    departure: { airport: 'JFK', date: '2026-08-15', time: '10:00', terminal: '8' },
    arrival: { airport: 'LHR', date: '2026-08-15', time: '22:00', terminal: '5' },
    ...overrides,
  };
}

function makeNormalizedOffer(overrides?: Partial<NormalizedFlightOffer>): NormalizedFlightOffer {
  return {
    id: 'off_00001',
    provider: 'duffel',
    price: { currency: 'USD', base: 500, taxes: 50, total: 550 },
    cabin: 'economy',
    stops: 0,
    segments: [makeSegment()],
    ...overrides,
  };
}

function makeRawDuffelOffer(overrides?: Record<string, any>): Record<string, any> {
  return {
    id: 'off_00001',
    expires_at: '2026-08-16T00:00:00Z',
    total_currency: 'USD',
    total_amount: '550.00',
    tax_currency: 'USD',
    tax_amount: '50.00',
    base_currency: 'USD',
    base_amount: '500.00',
    conditions: {},
    slices: [
      {
        id: 'slice_1',
        duration: 'PT12H',
        origin: { iata_code: 'JFK', type: 'airport', city_name: 'New York', name: 'John F Kennedy International Airport' },
        destination: { iata_code: 'LHR', type: 'airport', city_name: 'London', name: 'Heathrow Airport' },
        conditions: {},
        segments: [
          {
            id: 'seg_1',
            departing_at: '2026-08-15T10:00:00Z',
            arriving_at: '2026-08-15T22:00:00Z',
            duration: 'PT12H',
            marketing_carrier: { iata_code: 'BA', name: 'British Airways' },
            marketing_carrier_flight_number: 'BA178',
            operating_carrier: { iata_code: 'BA', name: 'British Airways' },
            origin: { iata_code: 'JFK', type: 'airport', terminal: '8', city_name: 'New York', name: 'John F Kennedy International Airport' },
            destination: { iata_code: 'LHR', type: 'airport', terminal: '5', city_name: 'London', name: 'Heathrow Airport' },
            passengers: [{ passenger_id: 'pax_1', fare_basis_code: 'Y', cabin_class_marketing_name: 'Economy', cabin_class: 'economy', baggages: [{ type: 'checked', quantity: 1, weight_kg: 23 }] }],
            aircraft: { name: 'Boeing 777', iata_code: '777' },
          },
        ],
      },
    ],
    passengers: [],
    owner: { iata_code: 'BA', name: 'British Airways', logo_symbol_url: 'https://example.com/ba.png', conditions_of_carriage_url: 'https://example.com/toc' },
    payment_requirements: { requires_immediate_payment: false, required_by: '2026-08-16T00:00:00Z', price_guarantee_expires_at: '2026-08-15T12:00:00Z' },
    ...overrides,
  };
}

function makeTravelportSegment(overrides?: Partial<NormalizedFlightSegment>): NormalizedFlightSegment {
  return {
    id: 'seg_tp_1',
    carrier: 'EK',
    flightNumber: 'EK501',
    operatingCarrier: 'EK',
    operatingCarrierName: 'Emirates',
    equipment: '388',
    duration: 'PT7H',
    stops: 0,
    departure: { airport: 'DXB', date: '2026-08-15', time: '14:00', terminal: '3' },
    arrival: { airport: 'LHR', date: '2026-08-15', time: '19:00', terminal: '4' },
    ...overrides,
  };
}

function makeTravelportOffer(overrides?: Partial<NormalizedFlightOffer>): NormalizedFlightOffer {
  return {
    id: 'tp_offer_1',
    provider: 'travelport',
    contentSource: 'GDS',
    price: { currency: 'USD', base: 600, taxes: 80, total: 680 },
    cabin: 'business',
    classOfService: 'C',
    fareBasisCode: 'CBUS50',
    stops: 0,
    segments: [makeTravelportSegment()],
    display: {
      airlineCode: 'EK',
      airlineName: 'Emirates',
      airlineLogoUrl: 'https://example.com/ek.png',
      flightNumber: 'EK501',
      origin: { code: 'DXB', label: 'Dubai (DXB)' },
      destination: { code: 'LHR', label: 'London (LHR)' },
      durationLabel: '7h',
      stopsLabel: 'Direct',
      fareBrand: 'Business Flex',
      cabinLabel: 'Business',
      baggage: { carryOnLabel: 'Carry-on: 1 piece', checkedLabel: 'Checked: 2 pieces', summaryLabel: 'Carry-on + Checked' },
      supplier: 'travelport',
      journeys: [{ direction: 'itinerary', label: 'Flight', segmentCount: 1 }],
    },
    metadata: {
      productRef: 'prod_1',
      productRefs: ['prod_1'],
      offeringId: 'offering_1',
    },
    ...overrides,
  };
}

function makeFlightRef(overrides?: Partial<Record<string, any>>): Record<string, any> {
  return {
    id: 'flt_1',
    carrier: 'EK',
    number: 'EK501',
    operatingCarrier: 'EK',
    departure: { location: 'DXB', date: '2026-08-15', time: '14:00', terminal: '3' },
    arrival: { location: 'LHR', date: '2026-08-15', time: '19:00', terminal: '4' },
    duration: 'PT7H',
    equipment: 'Airbus A380',
    ...overrides,
  };
}

function makeProductRef(overrides?: Partial<Record<string, any>>): Record<string, any> {
  return {
    id: 'prod_1',
    totalDuration: 'PT7H',
    flightSegments: [{ flightRef: 'flt_1', segmentSequence: 1 }],
    passengerFlights: [{ flightProducts: [{ cabin: 'business', classOfService: 'C', fareBasisCode: 'CBUS50' }] }],
    ...overrides,
  };
}

function makeTravelportCacheEntry(overrides?: Partial<SelectedOfferCacheEntry>): SelectedOfferCacheEntry {
  return {
    catalogUuid: 'cat_uuid_1',
    offeringIds: ['offering_1'],
    productRefs: ['prod_1'],
    productSelections: [],
    passengerCriteria: [{ number: 1, passengerTypeCode: 'ADT' }],
    referenceList: {
      products: { prod_1: makeProductRef() as any },
      flights: { flt_1: makeFlightRef() as any },
    },
    searchCriteria: { from: 'DXB', to: 'LHR', departureDate: '2026-08-15', adults: 1 },
    ...overrides,
  };
}

// ─── Mock Ref Data ────────────────────────────────────────────

const mockAirlines = [
  { iataCode: 'BA', name: 'British Airways', logoSymbolUrl: 'https://example.com/ba.png', logoLockupUrl: null },
  { iataCode: 'EK', name: 'Emirates', logoSymbolUrl: 'https://example.com/ek.png', logoLockupUrl: null },
];

const mockAirports = [
  { iataCode: 'JFK', name: 'John F Kennedy International Airport', cityName: 'New York' },
  { iataCode: 'LHR', name: 'Heathrow Airport', cityName: 'London' },
  { iataCode: 'DXB', name: 'Dubai International Airport', cityName: 'Dubai' },
  { iataCode: 'CMN', name: 'Mohammed V International Airport', cityName: 'Casablanca' },
];

// ─── Tests ────────────────────────────────────────────────────

describe('FlightOfferDetailViewMapper', () => {
  let mapper: FlightOfferDetailViewMapper;
  let refRepo: jest.Mocked<PrismaReferenceDataRepository>;

  beforeEach(async () => {
    refRepo = {
      findAirlinesByCodes: jest.fn().mockResolvedValue(mockAirlines),
      findAirportsByCodes: jest.fn().mockResolvedValue(mockAirports),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        FlightOfferDetailViewMapper,
        { provide: PrismaReferenceDataRepository, useValue: refRepo },
      ],
    }).compile();

    mapper = module.get<FlightOfferDetailViewMapper>(FlightOfferDetailViewMapper);
  });

  afterEach(() => jest.clearAllMocks());

  describe('Duffel mapping', () => {
    it('maps airline logo, name, and conditions URL', async () => {
      const normalized = makeNormalizedOffer();
      const raw = makeRawDuffelOffer();
      const view = await mapper.toDetailView({ provider: 'duffel', normalizedOffer: normalized, rawOffer: raw });

      expect(view.airline.code).toBe('BA');
      expect(view.airline.name).toBe('British Airways');
      expect(view.airline.logoUrl).toBe('https://example.com/ba.png');
      expect(view.airline.conditionsOfCarriageUrl).toBe('https://example.com/toc');
    });

    it('maps airport names and city names', async () => {
      const normalized = makeNormalizedOffer();
      const raw = makeRawDuffelOffer();
      const view = await mapper.toDetailView({ provider: 'duffel', normalizedOffer: normalized, rawOffer: raw });

      expect(view.route.from.cityName).toBe('New York');
      expect(view.route.from.airportName).toBe('John F Kennedy International Airport');
      expect(view.route.to.cityName).toBe('London');
      expect(view.route.to.airportName).toBe('Heathrow Airport');
    });

    it('maps baggage correctly', async () => {
      const normalized = makeNormalizedOffer();
      const raw = makeRawDuffelOffer();
      const view = await mapper.toDetailView({ provider: 'duffel', normalizedOffer: normalized, rawOffer: raw });

      expect(view.baggage).toBeDefined();
      expect(view.baggage!.checkedLabel).toContain('Checked');
      expect(view.baggage!.carryOnLabel).toBeUndefined();
      expect(view.baggage!.perSegment).toBeDefined();
      expect(view.baggage!.perSegment).toHaveLength(1);
    });

    it('maps refund and change conditions', async () => {
      const raw = makeRawDuffelOffer({
        conditions: {
          refund_before_departure: { allowed: true, penalty_amount: '50.00', penalty_currency: 'USD' },
          change_before_departure: { allowed: true, penalty_amount: '75.00', penalty_currency: 'USD' },
        },
      });
      const normalized = makeNormalizedOffer({
        display: {
          airlineCode: 'BA',
          origin: { code: 'JFK', label: 'New York (JFK)' },
          destination: { code: 'LHR', label: 'London (LHR)' },
          refundPolicy: { label: 'Refundable with fee', allowed: true, penaltyAmount: 50, penaltyCurrency: 'USD' },
          changePolicy: { label: 'Changeable with fee', allowed: true, penaltyAmount: 75, penaltyCurrency: 'USD' },
        },
      });

      const view = await mapper.toDetailView({ provider: 'duffel', normalizedOffer: normalized, rawOffer: raw });
      expect(view.fare.refundPolicy).toBeDefined();
      expect(view.fare.refundPolicy!.allowed).toBe(true);
      expect(view.fare.changePolicy).toBeDefined();
      expect(view.fare.changePolicy!.allowed).toBe(true);
    });

    it('maps payment requirements and expiry', async () => {
      const normalized = makeNormalizedOffer();
      const raw = makeRawDuffelOffer();
      const view = await mapper.toDetailView({ provider: 'duffel', normalizedOffer: normalized, rawOffer: raw });

      expect(view.pricing.offerExpiresAt).toBe('2026-08-16T00:00:00Z');
      expect(view.pricing.paymentRequiredBy).toBe('2026-08-16T00:00:00Z');
      expect(view.pricing.priceGuaranteeExpiresAt).toBe('2026-08-15T12:00:00Z');
    });

    it('maps passenger requirements', async () => {
      const raw = makeRawDuffelOffer({
        passenger_identity_documents_required: true,
        supported_passenger_identity_document_types: ['passport', 'known_traveler_number'],
        supported_loyalty_programmes: ['BA_EC'],
      });
      const normalized = makeNormalizedOffer();
      const view = await mapper.toDetailView({ provider: 'duffel', normalizedOffer: normalized, rawOffer: raw });

      expect(view.passengerRequirements).toBeDefined();
      expect(view.passengerRequirements!.identityDocumentsRequired).toBe(true);
      expect(view.passengerRequirements!.supportedIdentityDocumentTypes).toContain('passport');
      expect(view.passengerRequirements!.supportedLoyaltyProgrammes).toContain('BA_EC');
    });

    it('maps flight number with carrier code', async () => {
      const normalized = makeNormalizedOffer();
      const raw = makeRawDuffelOffer();
      const view = await mapper.toDetailView({ provider: 'duffel', normalizedOffer: normalized, rawOffer: raw });

      const seg = view.journeys[0].segments[0];
      expect(seg.flightNumber).toBe('BA178');
      expect(seg.airlineCode).toBe('BA');
    });

    it('maps price breakdown from raw offer', async () => {
      const normalized = makeNormalizedOffer();
      const raw = makeRawDuffelOffer({ base_amount: '480.00', tax_amount: '60.00', total_amount: '540.00' });
      const view = await mapper.toDetailView({ provider: 'duffel', normalizedOffer: normalized, rawOffer: raw });

      expect(view.pricing.baseAmount).toBe(480);
      expect(view.pricing.taxAmount).toBe(60);
      expect(view.pricing.supplierTotal).toBe(540);
      expect(view.pricing.currency).toBe('USD');
    });
  });

  describe('Travelport mapping', () => {
    it('maps ProductAir.totalDuration to route', async () => {
      const normalized = makeTravelportOffer();
      const cache = makeTravelportCacheEntry();
      const view = await mapper.toDetailView({ provider: 'travelport', normalizedOffer: normalized, selectedOfferContext: cache });

      expect(view.route.totalDurationLabel).toBe('7h');
      expect(view.route.stopsLabel).toBe('Direct');
    });

    it('resolves flight refs to segments with terminal/date/time', async () => {
      const normalized = makeTravelportOffer();
      const cache = makeTravelportCacheEntry();
      const view = await mapper.toDetailView({ provider: 'travelport', normalizedOffer: normalized, selectedOfferContext: cache });

      const seg = view.journeys[0].segments[0];
      expect(seg.departure.location.code).toBe('DXB');
      expect(seg.departure.location.terminal).toBe('3');
      expect(seg.departure.date).toBe('2026-08-15');
      expect(seg.departure.time).toBe('14:00');
      expect(seg.arrival.location.code).toBe('LHR');
      expect(seg.arrival.location.terminal).toBe('4');
      expect(seg.arrival.date).toBe('2026-08-15');
      expect(seg.arrival.time).toBe('19:00');
    });

    it('maps airline and operating carrier', async () => {
      const normalized = makeTravelportOffer();
      const cache = makeTravelportCacheEntry();
      const view = await mapper.toDetailView({ provider: 'travelport', normalizedOffer: normalized, selectedOfferContext: cache });

      expect(view.airline.code).toBe('EK');
      expect(view.airline.name).toBe('Emirates');
      expect(view.airline.operatingAirlineName).toBe('Emirates');
    });

    it('maps baggage allowances', async () => {
      const normalized = makeTravelportOffer();
      const cache = makeTravelportCacheEntry();
      const view = await mapper.toDetailView({ provider: 'travelport', normalizedOffer: normalized, selectedOfferContext: cache });

      expect(view.baggage).toBeDefined();
      expect(view.baggage!.carryOnLabel).toContain('Carry-on');
      expect(view.baggage!.checkedLabel).toContain('Checked');
    });

    it('maps fare basis and class of service', async () => {
      const normalized = makeTravelportOffer();
      const cache = makeTravelportCacheEntry();
      const view = await mapper.toDetailView({ provider: 'travelport', normalizedOffer: normalized, selectedOfferContext: cache });

      expect(view.fare.cabin).toBe('Business');
      expect(view.fare.classOfService).toBe('C');
      expect(view.fare.fareBasisCode).toBe('CBUS50');
      expect(view.fare.fareBrand).toBe('Business Flex');
    });

    it('maps price breakdown', async () => {
      const normalized = makeTravelportOffer();
      const cache = makeTravelportCacheEntry();
      const view = await mapper.toDetailView({ provider: 'travelport', normalizedOffer: normalized, selectedOfferContext: cache });

      expect(view.pricing.baseAmount).toBe(600);
      expect(view.pricing.taxAmount).toBe(80);
      expect(view.pricing.supplierTotal).toBe(680);
      expect(view.pricing.currency).toBe('USD');
    });
  });

  describe('Airport enrichment', () => {
    it('CMN maps correctly to Casablanca / Mohammed V', async () => {
      refRepo.findAirportsByCodes.mockResolvedValue([
        { iataCode: 'CMN', name: 'Mohammed V International Airport', cityName: 'Casablanca' },
      ]);
      refRepo.findAirlinesByCodes.mockResolvedValue([]);

      const normalized = makeNormalizedOffer({
        segments: [makeSegment({
          carrier: 'CM',
          flightNumber: 'CM101',
          departure: { airport: 'CMN', date: '2026-08-15', time: '14:00', terminal: '1' },
          arrival: { airport: 'JFK', date: '2026-08-15', time: '22:00', terminal: '8' },
        })],
      });
      const raw = makeRawDuffelOffer({
        slices: [{
          id: 'slice_cm',
          origin: { iata_code: 'CMN', type: 'airport' },
          destination: { iata_code: 'JFK', type: 'airport' },
          segments: [{
            id: 'seg_cm',
            departing_at: '2026-08-15T14:00:00Z',
            arriving_at: '2026-08-15T22:00:00Z',
            duration: 'PT8H',
            marketing_carrier: { iata_code: 'CM' },
            marketing_carrier_flight_number: 'CM101',
            origin: { iata_code: 'CMN', type: 'airport', terminal: '1' },
            destination: { iata_code: 'JFK', type: 'airport', terminal: '8' },
            passengers: [],
            aircraft: {},
          }],
        }],
      });

      const view = await mapper.toDetailView({ provider: 'duffel', normalizedOffer: normalized, rawOffer: raw });

      expect(view.route.from.cityName).toBe('Casablanca');
      expect(view.route.from.airportName).toBe('Mohammed V International Airport');
    });

    it('unknown airport code falls back to code only', async () => {
      refRepo.findAirportsByCodes.mockResolvedValue([]);
      refRepo.findAirlinesByCodes.mockResolvedValue([]);

      const normalized = makeNormalizedOffer({
        segments: [makeSegment({
          departure: { airport: 'XYZ', date: '2026-08-15', time: '10:00' },
          arrival: { airport: 'ABC', date: '2026-08-15', time: '22:00' },
        })],
      });
      const raw = makeRawDuffelOffer({
        slices: [{
          id: 'slice_xx',
          origin: { iata_code: 'XYZ', type: 'airport' },
          destination: { iata_code: 'ABC', type: 'airport' },
          segments: [{
            id: 'seg_xx',
            departing_at: '2026-08-15T10:00:00Z',
            arriving_at: '2026-08-15T22:00:00Z',
            duration: 'PT12H',
            marketing_carrier: { iata_code: 'BA' },
            marketing_carrier_flight_number: 'BA178',
            origin: { iata_code: 'XYZ', type: 'airport' },
            destination: { iata_code: 'ABC', type: 'airport' },
            passengers: [],
            aircraft: {},
          }],
        }],
      });

      const view = await mapper.toDetailView({ provider: 'duffel', normalizedOffer: normalized, rawOffer: raw });

      expect(view.route.from.airportName).toBeUndefined();
      expect(view.route.from.cityName).toBeUndefined();
    });
  });

  describe('Round trip', () => {
    it('splits outbound and return journeys correctly', async () => {
      const raw = makeRawDuffelOffer({
        slices: [
          {
            id: 'slice_out',
            duration: 'PT12H',
            origin: { iata_code: 'JFK', type: 'airport', city_name: 'New York', name: 'JFK' },
            destination: { iata_code: 'LHR', type: 'airport', city_name: 'London', name: 'Heathrow' },
            conditions: {},
            segments: [{
              id: 'seg_out',
              departing_at: '2026-08-15T10:00:00Z',
              arriving_at: '2026-08-15T22:00:00Z',
              duration: 'PT12H',
              marketing_carrier: { iata_code: 'BA' },
              marketing_carrier_flight_number: 'BA178',
              origin: { iata_code: 'JFK', type: 'airport', terminal: '8' },
              destination: { iata_code: 'LHR', type: 'airport', terminal: '5' },
              passengers: [],
              aircraft: {},
            }],
          },
          {
            id: 'slice_ret',
            duration: 'PT11H',
            origin: { iata_code: 'LHR', type: 'airport', city_name: 'London', name: 'Heathrow' },
            destination: { iata_code: 'JFK', type: 'airport', city_name: 'New York', name: 'JFK' },
            conditions: {},
            segments: [{
              id: 'seg_ret',
              departing_at: '2026-08-20T14:00:00Z',
              arriving_at: '2026-08-20T17:00:00Z',
              duration: 'PT11H',
              marketing_carrier: { iata_code: 'BA' },
              marketing_carrier_flight_number: 'BA179',
              origin: { iata_code: 'LHR', type: 'airport', terminal: '5' },
              destination: { iata_code: 'JFK', type: 'airport', terminal: '8' },
              passengers: [],
              aircraft: {},
            }],
          },
        ],
      });
      const normalized = makeNormalizedOffer({
        provider: 'duffel',
        display: { airlineCode: 'BA', origin: { code: 'JFK', label: 'JFK' }, destination: { code: 'JFK', label: 'JFK' }, journeys: [{ direction: 'outbound', label: 'Outbound', segmentCount: 1 }, { direction: 'return', label: 'Return', segmentCount: 1 }] },
      });

      const view = await mapper.toDetailView({ provider: 'duffel', normalizedOffer: normalized, rawOffer: raw });

      expect(view.route.tripType).toBe('round_trip');
      expect(view.journeys).toHaveLength(2);
      expect(view.journeys[0].direction).toBe('outbound');
      expect(view.journeys[0].label).toBe('Outbound');
      expect(view.journeys[1].direction).toBe('return');
      expect(view.journeys[1].label).toBe('Return');
    });
  });

  describe('Error handling', () => {
    it('throws for unknown provider', async () => {
      const normalized = makeNormalizedOffer({ provider: 'unknown' });
      await expect(mapper.toDetailView({ provider: 'unknown' as any, normalizedOffer: normalized }))
        .rejects.toThrow('FlightOfferDetailView mapping not implemented for provider: unknown');
    });

    it('enrichment failure does not break the view', async () => {
      const normalized = makeNormalizedOffer();
      const raw = makeRawDuffelOffer();
      const view = await mapper.toDetailView({ provider: 'duffel', normalizedOffer: normalized, rawOffer: raw });
      expect(view.offerId).toBe('off_00001');
    });
  });
});
