import { Test } from '@nestjs/testing';
import { TravelportSeatMapBuilderService } from './travelport-seat-map-builder.service';
import { TravelportPayloadBuilderService } from './travelport-payload-builder.service';

describe('TravelportSeatMapBuilderService', () => {
  let service: TravelportSeatMapBuilderService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TravelportSeatMapBuilderService,
        {
          provide: TravelportPayloadBuilderService,
          useValue: {
            buildProductCriteriaAir: (entry: any) => {
              if (!entry?.referenceList?.flights) return [];
              return [
                {
                  '@type': 'ProductCriteriaAir',
                  sequence: 1,
                  SpecificFlightCriteria: [
                    {
                      flightNumber: '123',
                      carrier: 'AA',
                      departureDate: '2026-07-15',
                      from: 'JFK',
                      to: 'ORD',
                      classOfService: 'Y',
                      cabin: 'economy',
                    },
                  ],
                  validateInventoryInd: true,
                },
              ];
            },
          },
        },
      ],
    }).compile();
    service = module.get(TravelportSeatMapBuilderService);
  });

  describe('buildGdsFromProducts', () => {
    it('builds valid BuildFromProducts body from cache entry', () => {
      const entry = {
        referenceList: {
          flights: { f1: {} },
        },
      };
      const body = service.buildGdsFromProducts(entry as any) as Record<string, unknown>;
      expect(body['@type']).toBe('CatalogOfferingsQuerySeatAvailability');
      const seatAvail = body.SeatAvailabilityOfferings as Record<string, unknown>;
      expect(seatAvail['@type']).toBe('SeatAvailabilityOfferingsBuildFromProducts');
      const criteria = seatAvail.ProductCriteriaAir as Record<string, unknown>;
      expect(criteria['@type']).toBe('ProductCriteriaAir');
    });

    it('falls back to empty criteria when no reference list', () => {
      const entry = {};
      const body = service.buildGdsFromProducts(entry as any) as Record<string, unknown>;
      const seatAvail = body.SeatAvailabilityOfferings as Record<string, unknown>;
      const criteria = seatAvail.ProductCriteriaAir as Record<string, unknown>;
      expect(criteria.SpecificFlightCriteria).toEqual([]);
    });
  });

  describe('buildGdsFromOfferList', () => {
    it('builds valid BuildFromOfferList body', () => {
      const body = service.buildGdsFromOfferList('offerList-1', 'offer-1', ['p1', 'p2']) as Record<string, unknown>;
      expect(body['@type']).toBe('CatalogOfferingsQuerySeatAvailability');
      const seatAvail = body.SeatAvailabilityOfferings as Record<string, unknown>;
      expect(seatAvail['@type']).toBe('SeatAvailabilityOfferingsBuildFromOfferList');
      const offerList = (seatAvail.BuildFromOfferList as Record<string, unknown>);
      expect(offerList.OfferListIdentifier).toBe('offerList-1');
      expect(Array.isArray(offerList.OfferIdentifier)).toBe(true);
      expect(Array.isArray(offerList.ProductIdentifier)).toBe(true);
    });
  });

  describe('buildNdc', () => {
    it('builds valid BuildFromCatalogProductOfferings body', () => {
      const selections = [{ offeringId: 'CPO0', productIds: ['p0'] }];
      const body = service.buildNdc('catalog-uuid', selections) as Record<string, unknown>;
      expect(body['@type']).toBe('CatalogOfferingsQuerySeatAvailability');
      const seatAvail = body.SeatAvailabilityOfferings as Record<string, unknown>;
      expect(seatAvail['@type']).toBe('SeatAvailabilityOfferingsBuildFromCatalogProductOfferings');
      const buildReq = (seatAvail.BuildFromCatalogProductOfferingsRequest as Record<string, unknown>);
      expect((buildReq.CatalogProductOfferingsIdentifier as Record<string, unknown>).Identifier).toEqual({ value: 'catalog-uuid' });
    });
  });

  describe('buildFromReservationWorkbench', () => {
    it('builds valid BuildFromReservationWorkbench body', () => {
      const body = service.buildFromReservationWorkbench('wb-123') as Record<string, unknown>;
      expect(body['@type']).toBe('CatalogOfferingsQuerySeatAvailability');
      const seatAvail = body.SeatAvailabilityOfferings as Record<string, unknown>;
      expect(seatAvail['@type']).toBe('SeatAvailabilityOfferingsBuildFromReservationWorkbench');
      const build = (seatAvail.BuildFromReservationWorkbench as Record<string, unknown>);
      expect((build.ReservationIdentifier as Record<string, unknown>).Identifier).toEqual({ value: 'wb-123' });
    });
  });
});
