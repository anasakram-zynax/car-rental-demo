import { Test } from '@nestjs/testing';
import { TravelportPayloadBuilderService } from './travelport-payload-builder.service';
import type { SelectedOfferCacheEntry } from '../../domain/entities/flight-search-response';

function makeCacheEntry(overrides: Partial<SelectedOfferCacheEntry> = {}): SelectedOfferCacheEntry {
  return {
    catalogUuid: 'cat-uuid-1',
    offeringIds: ['offer-1'],
    productRefs: ['p0'],
    productSelections: [{ offeringId: 'offer-1', productIds: ['p0'] }],
    contentSource: 'GDS',
    passengerCriteria: [{ number: 1, passengerTypeCode: 'ADT' }],
    referenceList: {
      products: {
        p0: {
          id: 'p0',
          flightSegments: [
            {
              flightRef: 'f0',
              segmentSequence: 1,
            },
          ],
          passengerFlights: [
            {
              flightProducts: [
                {
                  cabin: 'economy',
                  classOfService: 'Y',
                },
              ],
            },
          ],
          availabilitySourceCode: 'AVL-1',
        },
      },
      flights: {
        f0: {
          id: 'f0',
          carrier: 'AA',
          number: '123',
          departure: { location: 'JFK', date: '2026-07-15', time: '10:00' },
          arrival: { location: 'ORD', date: '2026-07-15', time: '12:00' },
        },
      },
      brands: {},
    },
    searchCriteria: {
      from: 'JFK',
      to: 'ORD',
      departureDate: '2026-07-15',
      tripType: 'one_way',
      adults: 1,
    },
    ...overrides,
  };
}

describe('TravelportPayloadBuilderService', () => {
  let service: TravelportPayloadBuilderService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [TravelportPayloadBuilderService],
    }).compile();
    service = module.get(TravelportPayloadBuilderService);
  });

  // ── buildFromProducts ──

  describe('buildFromProducts', () => {
    it('creates a valid BuildFromProductsRequestAir for one-way trip', () => {
      const entry = makeCacheEntry();
      const payload = service.buildFromProducts(entry);

      expect(payload['@type']).toBe('OfferQueryBuildFromProducts');
      expect(payload.BuildFromProductsRequest['@type']).toBe('BuildFromProductsRequestAir');
      expect(payload.BuildFromProductsRequest.ProductCriteriaAir).toHaveLength(1);

      const criteria = payload.BuildFromProductsRequest.ProductCriteriaAir[0];
      expect(criteria['@type']).toBe('ProductCriteriaAir');
      expect(criteria.SpecificFlightCriteria).toHaveLength(1);

      const flight = criteria.SpecificFlightCriteria[0];
      expect(flight.flightNumber).toBe('123');
      expect(flight.carrier).toBe('AA');
      expect(flight.from).toBe('JFK');
      expect(flight.to).toBe('ORD');
      expect(flight.departureDate).toBe('2026-07-15');
      expect(flight.departureTime).toBe('10:00');
      expect(flight.arrivalDate).toBe('2026-07-15');
      expect(flight.arrivalTime).toBe('12:00');
      expect(flight.ContentSource).toBe('GDS');
    });

    it('creates two ProductCriteriaAir entries for round-trip', () => {
      const entry = makeCacheEntry({
        productSelections: [
          { offeringId: 'offer-1', productIds: ['p0'] },
          { offeringId: 'offer-2', productIds: ['p1'] },
        ],
        referenceList: {
          products: {
            p0: {
              id: 'p0',
              flightSegments: [{ flightRef: 'f0', segmentSequence: 1 }],
              passengerFlights: [{ flightProducts: [{ cabin: 'economy', classOfService: 'Y' }] }],
            },
            p1: {
              id: 'p1',
              flightSegments: [{ flightRef: 'f1', segmentSequence: 1 }],
              passengerFlights: [{ flightProducts: [{ cabin: 'economy', classOfService: 'Y' }] }],
            },
          },
          flights: {
            f0: {
              id: 'f0', carrier: 'AA', number: '123',
              departure: { location: 'JFK', date: '2026-07-15', time: '10:00' },
              arrival: { location: 'ORD', date: '2026-07-15', time: '12:00' },
            },
            f1: {
              id: 'f1', carrier: 'UA', number: '456',
              departure: { location: 'ORD', date: '2026-07-20', time: '14:00' },
              arrival: { location: 'JFK', date: '2026-07-20', time: '16:00' },
            },
          },
          brands: {},
        },
      });

      const payload = service.buildFromProducts(entry);
      expect(payload.BuildFromProductsRequest.ProductCriteriaAir).toHaveLength(2);

      const [outbound, inbound] = payload.BuildFromProductsRequest.ProductCriteriaAir;
      expect(outbound.SpecificFlightCriteria[0].carrier).toBe('AA');
      expect(outbound.SpecificFlightCriteria[0].from).toBe('JFK');
      expect(inbound.SpecificFlightCriteria[0].carrier).toBe('UA');
      expect(inbound.SpecificFlightCriteria[0].from).toBe('ORD');
    });

    it('includes PassengerCriteria from cache entry', () => {
      const entry = makeCacheEntry({
        passengerCriteria: [
          { number: 1, passengerTypeCode: 'ADT' },
          { number: 2, passengerTypeCode: 'CHD' },
        ],
      });

      const payload = service.buildFromProducts(entry);
      const pax = payload.BuildFromProductsRequest.PassengerCriteria;
      expect(pax).toHaveLength(2);
      expect(pax[0]).toEqual({ '@type': 'PassengerCriteria', number: 1, passengerTypeCode: 'ADT' });
      expect(pax[1]).toEqual({ '@type': 'PassengerCriteria', number: 2, passengerTypeCode: 'CHD' });
    });

    it('includes CurrencyCode when cache entry has currency', () => {
      const entry = makeCacheEntry({ currency: 'EUR' });
      const payload = service.buildFromProducts(entry);
      expect(payload.BuildFromProductsRequest.CurrencyCode).toBe('EUR');
    });

    it('omits CurrencyCode when cache entry has no currency', () => {
      const entry = makeCacheEntry({ currency: undefined });
      const payload = service.buildFromProducts(entry);
      expect(payload.BuildFromProductsRequest.CurrencyCode).toBeUndefined();
    });

    it('includes brandTier when brand ref and tier are available', () => {
      const entry = makeCacheEntry({
        referenceList: {
          products: {
            p0: {
              id: 'p0',
              brandRef: 'br-1',
              flightSegments: [{ flightRef: 'f0', segmentSequence: 1 }],
              passengerFlights: [{ flightProducts: [{ cabin: 'economy', classOfService: 'Y' }] }],
            },
          },
          flights: {
            f0: {
              id: 'f0', carrier: 'AA', number: '123',
              departure: { location: 'JFK', date: '2026-07-15', time: '10:00' },
              arrival: { location: 'ORD', date: '2026-07-15', time: '12:00' },
            },
          },
          brands: { 'br-1': { id: 'br-1', name: 'Economy', tier: 1 } },
        },
      });

      const payload = service.buildFromProducts(entry);
      const flight = payload.BuildFromProductsRequest.ProductCriteriaAir[0].SpecificFlightCriteria[0];
      expect(flight.brandTier).toBe(1);
    });

    it('sets brandTier null when brand ref not found in reference list', () => {
      const entry = makeCacheEntry({
        referenceList: {
          products: {
            p0: {
              id: 'p0',
              brandRef: 'br-unknown',
              flightSegments: [{ flightRef: 'f0', segmentSequence: 1 }],
              passengerFlights: [{ flightProducts: [{ cabin: 'economy', classOfService: 'Y' }] }],
            },
          },
          flights: {
            f0: {
              id: 'f0', carrier: 'AA', number: '123',
              departure: { location: 'JFK', date: '2026-07-15', time: '10:00' },
              arrival: { location: 'ORD', date: '2026-07-15', time: '12:00' },
            },
          },
          brands: {},
        },
      });

      const payload = service.buildFromProducts(entry);
      const flight = payload.BuildFromProductsRequest.ProductCriteriaAir[0].SpecificFlightCriteria[0];
      expect(flight.brandTier).toBeNull();
    });

    it('sets ContentSource to GDS for GDS cache entries', () => {
      const entry = makeCacheEntry({ contentSource: 'GDS' });
      const payload = service.buildFromProducts(entry);
      const flight = payload.BuildFromProductsRequest.ProductCriteriaAir[0].SpecificFlightCriteria[0];
      expect(flight.ContentSource).toBe('GDS');
    });

    it('sets ContentSource to NDC for NDC cache entries', () => {
      const entry = makeCacheEntry({ contentSource: 'NDC' });
      const payload = service.buildFromProducts(entry);
      const flight = payload.BuildFromProductsRequest.ProductCriteriaAir[0].SpecificFlightCriteria[0];
      expect(flight.ContentSource).toBe('NDC');
    });

    it('falls back ContentSource to GDS for legacy entries without contentSource', () => {
      const entry = makeCacheEntry({ contentSource: undefined });
      const payload = service.buildFromProducts(entry);
      const flight = payload.BuildFromProductsRequest.ProductCriteriaAir[0].SpecificFlightCriteria[0];
      expect(flight.ContentSource).toBe('GDS');
    });

    it('throws FLIGHTS_PAYLOAD_BUILD_FAILED when no products in reference list', () => {
      const entry = makeCacheEntry({ referenceList: { products: {}, flights: { f0: {} as any }, brands: {} } });
      expect(() => service.buildFromProducts(entry)).toThrow('FLIGHTS_PAYLOAD_BUILD_FAILED: No reference list products available');
    });

    it('throws FLIGHTS_PAYLOAD_BUILD_FAILED when no flights in reference list', () => {
      const entry = makeCacheEntry({ referenceList: { products: { p0: {} as any }, flights: {}, brands: {} } });
      expect(() => service.buildFromProducts(entry)).toThrow('FLIGHTS_PAYLOAD_BUILD_FAILED: No reference list flights available');
    });

    it('throws when product ref is not found in reference list', () => {
      const entry = makeCacheEntry({
        productSelections: [{ offeringId: 'offer-1', productIds: ['missing-ref'] }],
      });
      expect(() => service.buildFromProducts(entry)).toThrow('FLIGHTS_PAYLOAD_BUILD_FAILED: Product ref "missing-ref" not found in reference list');
    });

    it('throws when flight ref is not found for a segment', () => {
      // Provide flights entry that EXISTS but doesn't match the referenced flight ref
      const entry = makeCacheEntry({
        referenceList: {
          products: {
            p0: {
              id: 'p0',
              flightSegments: [{ flightRef: 'missing-flight', segmentSequence: 1 }],
              passengerFlights: [{ flightProducts: [{ cabin: 'economy', classOfService: 'Y' }] }],
            },
          },
          flights: {
            'other-flight': {
              id: 'other-flight', carrier: 'AA', number: '999',
              departure: { location: 'JFK', date: '2026-07-15', time: '10:00' },
              arrival: { location: 'ORD', date: '2026-07-15', time: '12:00' },
            },
          },
          brands: {},
        },
      });
      expect(() => service.buildFromProducts(entry)).toThrow('FLIGHTS_PAYLOAD_BUILD_FAILED: Flight ref "missing-flight"');
    });

    it('throws when no flight criteria can be built', () => {
      const entry = makeCacheEntry({
        productSelections: [{ offeringId: 'offer-1', productIds: ['p0'] }],
        referenceList: {
          products: {
            p0: {
              id: 'p0',
              flightSegments: [],
              passengerFlights: [],
            },
          },
          flights: { f0: {} as any },
          brands: {},
        },
      });
      expect(() => service.buildFromProducts(entry)).toThrow('FLIGHTS_PAYLOAD_BUILD_FAILED: Product p0 has no flight segments');
    });

    it('preserves segmentSequence from the flight segment', () => {
      const entry = makeCacheEntry();
      const segmentSeq = 5;
      const entryWithSeq = makeCacheEntry({
        referenceList: {
          products: {
            p0: {
              id: 'p0',
              flightSegments: [{ flightRef: 'f0', segmentSequence: segmentSeq }],
              passengerFlights: [{ flightProducts: [{ cabin: 'business', classOfService: 'J' }] }],
            },
          },
          flights: {
            f0: {
              id: 'f0', carrier: 'AA', number: '123',
              departure: { location: 'JFK', date: '2026-07-15', time: '10:00' },
              arrival: { location: 'ORD', date: '2026-07-15', time: '12:00' },
            },
          },
          brands: {},
        },
      });

      const payload = service.buildFromProducts(entryWithSeq);
      const flight = payload.BuildFromProductsRequest.ProductCriteriaAir[0].SpecificFlightCriteria[0];
      expect(flight.segmentSequence).toBe(segmentSeq);
    });
  });

  // ── buildProductCriteriaAir ──

  describe('buildProductCriteriaAir', () => {
    it('returns empty array when no products in reference list', () => {
      const entry = makeCacheEntry({ referenceList: { products: {}, flights: { f0: {} as any }, brands: {} } });
      expect(service.buildProductCriteriaAir(entry)).toEqual([]);
    });

    it('returns empty array when no flights in reference list', () => {
      const entry = makeCacheEntry({ referenceList: { products: { p0: {} as any }, flights: {}, brands: {} } });
      expect(service.buildProductCriteriaAir(entry)).toEqual([]);
    });

    it('skips products without flight segments gracefully', () => {
      const entry = makeCacheEntry({
        productSelections: [{ offeringId: 'offer-1', productIds: ['p0'] }],
        referenceList: {
          products: {
            p0: {
              id: 'p0',
              flightSegments: [{ flightRef: 'f0', segmentSequence: 1 }],
              passengerFlights: [{ flightProducts: [{ cabin: 'economy', classOfService: 'Y' }] }],
            },
          },
          flights: {
            f0: {
              id: 'f0', carrier: 'AA', number: '123',
              departure: { location: 'JFK', date: '2026-07-15', time: '10:00' },
              arrival: { location: 'ORD', date: '2026-07-15', time: '12:00' },
            },
          },
          brands: {},
        },
      });

      const criteriaList = service.buildProductCriteriaAir(entry);
      expect(criteriaList).toHaveLength(1);
      expect(criteriaList[0].sequence).toBe(1);
    });

    it('sets sequential sequence numbers for each criteria', () => {
      const entry = makeCacheEntry({
        productSelections: [
          { offeringId: 'offer-1', productIds: ['p0'] },
          { offeringId: 'offer-2', productIds: ['p1'] },
        ],
        referenceList: {
          products: {
            p0: {
              id: 'p0',
              flightSegments: [{ flightRef: 'f0', segmentSequence: 1 }],
              passengerFlights: [{ flightProducts: [{ cabin: 'economy', classOfService: 'Y' }] }],
            },
            p1: {
              id: 'p1',
              flightSegments: [{ flightRef: 'f1', segmentSequence: 1 }],
              passengerFlights: [{ flightProducts: [{ cabin: 'economy', classOfService: 'Y' }] }],
            },
          },
          flights: {
            f0: {
              id: 'f0', carrier: 'AA', number: '123',
              departure: { location: 'JFK', date: '2026-07-15', time: '10:00' },
              arrival: { location: 'ORD', date: '2026-07-15', time: '12:00' },
            },
            f1: {
              id: 'f1', carrier: 'UA', number: '456',
              departure: { location: 'ORD', date: '2026-07-20', time: '14:00' },
              arrival: { location: 'JFK', date: '2026-07-20', time: '16:00' },
            },
          },
          brands: {},
        },
      });

      const criteriaList = service.buildProductCriteriaAir(entry);
      expect(criteriaList[0].sequence).toBe(1);
      expect(criteriaList[1].sequence).toBe(2);
    });
  });
});
