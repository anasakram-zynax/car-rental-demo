import { Test } from '@nestjs/testing';
import { HotelGroupingService } from './hotel-grouping.service';
import type { HotelSupplierLinksRepoPort, HotelSupplierLinksRecord } from '../ports/hotel-provider-mapping-repo.port';
import { HotelSupplierLinksRepoPortToken } from '../ports/hotel-provider-mapping-repo.port';
import type { NormalizedHotelSummary } from '../../domain/types/hotel-provider.types';

describe('HotelGroupingService', () => {
  let service: HotelGroupingService;
  let mappingRepo: jest.Mocked<HotelSupplierLinksRepoPort>;

  beforeEach(async () => {
    mappingRepo = {
      findAllActive: jest.fn(),
      findByProvider: jest.fn(),
      findByCanonical: jest.fn(),
      findAllByProvider: jest.fn(),
      findByProviderHotelIds: jest.fn(),
      upsert: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        HotelGroupingService,
        { provide: HotelSupplierLinksRepoPortToken, useValue: mappingRepo },
      ],
    }).compile();

    service = module.get<HotelGroupingService>(HotelGroupingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Helpers ─────────────────────────────────────────────────

  function makeHotel(overrides: Partial<NormalizedHotelSummary> & { hotelId: string }): NormalizedHotelSummary {
    return {
      hotelId: overrides.hotelId,
      providerHotelId: overrides.providerHotelId ?? overrides.hotelId,
      name: overrides.name ?? 'Test Hotel',
      destinationCode: overrides.destinationCode ?? 'LON',
      destinationName: overrides.destinationName ?? 'London',
      categoryName: overrides.categoryName ?? '4 stars',
      // Only include lat/lng when a truthy string value is provided
      ...(overrides.latitude ? { latitude: overrides.latitude } : {}),
      ...(overrides.longitude ? { longitude: overrides.longitude } : {}),
      // Only include minRate/rates when explicitly provided (undefined = omit)
      ...(overrides.minRate !== undefined ? { minRate: overrides.minRate } : { minRate: { rateId: 'rate-1', total: 200, currency: 'EUR' } }),
      ...(overrides.rates !== undefined ? { rates: overrides.rates } : { rates: [] }),
      roomsCount: overrides.roomsCount ?? 1,
    };
  }

  function makeMapping(overrides: Partial<HotelSupplierLinksRecord> & { provider: string; providerHotelId: string }): HotelSupplierLinksRecord {
    return {
      id: `map-${overrides.provider}-${overrides.providerHotelId}`,
      canonicalHotelId: overrides.canonicalHotelId ?? `canonical-${overrides.providerHotelId}`,
      provider: overrides.provider,
      providerHotelId: overrides.providerHotelId,
      name: overrides.name ?? null,
      normalizedName: overrides.normalizedName ?? null,
      addressHash: overrides.addressHash ?? null,
      latitude: overrides.latitude ?? null,
      longitude: overrides.longitude ?? null,
      confidence: overrides.confidence ?? null,
      status: overrides.status ?? 'active',
      payload: overrides.payload ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ── Explicit Mapping Tests ─────────────────────────────────

  describe('explicit mappings', () => {
    it('groups hotels from different providers under the same canonicalHotelId', async () => {
      const hotelbedsHotel = makeHotel({ hotelId: 'HB-001', providerHotelId: '12345', name: 'Grand Hotel Paris', destinationCode: 'PAR', destinationName: 'Paris', latitude: '48.8566', longitude: '2.3522' });
      const ratehawkHotel = makeHotel({ hotelId: 'RH-001', providerHotelId: '67890', name: 'Grand Hotel Paris', destinationCode: 'PAR', destinationName: 'Paris', latitude: '48.8566', longitude: '2.3522' });

      mappingRepo.findByProviderHotelIds.mockResolvedValue([
        makeMapping({ provider: 'hotelbeds', providerHotelId: '12345', canonicalHotelId: 'canonical-paris-grand' }),
        makeMapping({ provider: 'ratehawk', providerHotelId: '67890', canonicalHotelId: 'canonical-paris-grand' }),
      ]);

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [hotelbedsHotel] } },
        { provider: 'ratehawk', raw: { hotels: [ratehawkHotel] } },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].hotelGroupId).toBe('canonical-paris-grand');
      expect(results[0].displayName).toBe('Grand Hotel Paris');
      expect(results[0].providers).toHaveLength(2);
      expect(results[0].providers[0].provider).toBe('hotelbeds');
      expect(results[0].providers[1].provider).toBe('ratehawk');
    });

    it('groups three providers together for the same hotel', async () => {
      const hb = makeHotel({ hotelId: 'HB-001', providerHotelId: '111', name: 'Hotel Madrid' });
      const rh = makeHotel({ hotelId: 'RH-001', providerHotelId: '222', name: 'Hotel Madrid' });
      const hb2 = makeHotel({ hotelId: 'HB-002', providerHotelId: '333', name: 'Hotel Madrid' });

      mappingRepo.findByProviderHotelIds.mockResolvedValue([
        makeMapping({ provider: 'hotelbeds', providerHotelId: '111', canonicalHotelId: 'canonical-madrid' }),
        makeMapping({ provider: 'ratehawk', providerHotelId: '222', canonicalHotelId: 'canonical-madrid' }),
        makeMapping({ provider: 'hotelbeds', providerHotelId: '333', canonicalHotelId: 'canonical-madrid' }),
      ]);

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [hb, hb2] } },
        { provider: 'ratehawk', raw: { hotels: [rh] } },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].providers).toHaveLength(3);
    });
  });

  // ── Auto-Grouping Tests ────────────────────────────────────

  describe('auto-grouping', () => {
    it('auto-groups hotels with very similar names and same city', async () => {
      mappingRepo.findByProviderHotelIds.mockResolvedValue([]); // No explicit mappings

      const hotelbeds = makeHotel({
        hotelId: 'HB-001',
        providerHotelId: '12345',
        name: 'Grand Hotel Paris Center',
        destinationName: 'Paris',
        latitude: '48.8566',
        longitude: '2.3522',
      });
      const ratehawk = makeHotel({
        hotelId: 'RH-001',
        providerHotelId: '67890',
        name: 'Grand Hotel Paris Centre',
        destinationName: 'Paris',
        latitude: '48.8570',
        longitude: '2.3518',
      });

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [hotelbeds] } },
        { provider: 'ratehawk', raw: { hotels: [ratehawk] } },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].providers).toHaveLength(2);
      expect(results[0].hotelGroupId).toContain('auto:');
    });

    it('does NOT auto-group hotels with different names in the same city', async () => {
      mappingRepo.findByProviderHotelIds.mockResolvedValue([]);

      const hotelbeds = makeHotel({
        hotelId: 'HB-001',
        name: 'Grand Hotel Paris',
        destinationName: 'Paris',
      });
      const ratehawk = makeHotel({
        hotelId: 'RH-001',
        name: 'Budget Inn Paris',
        destinationName: 'Paris',
      });

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [hotelbeds] } },
        { provider: 'ratehawk', raw: { hotels: [ratehawk] } },
      ]);

      expect(results).toHaveLength(2);
    });

    it('does NOT auto-group hotels in different cities with similar names', async () => {
      mappingRepo.findByProviderHotelIds.mockResolvedValue([]);

      const hotelbeds = makeHotel({
        hotelId: 'HB-001',
        name: 'Grand Hotel Central',
        destinationName: 'Madrid',
        latitude: '40.4168',
        longitude: '-3.7038',
      });
      const ratehawk = makeHotel({
        hotelId: 'RH-001',
        name: 'Grand Hotel Central',
        destinationName: 'Barcelona',
        latitude: '41.3874',
        longitude: '2.1686',
      });

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [hotelbeds] } },
        { provider: 'ratehawk', raw: { hotels: [ratehawk] } },
      ]);

      expect(results).toHaveLength(2);
    });

    it('does NOT auto-group hotels with close names but far lat/lng', async () => {
      mappingRepo.findByProviderHotelIds.mockResolvedValue([]);

      const hotelbeds = makeHotel({
        hotelId: 'HB-001',
        name: 'Marriott London',
        destinationName: 'London',
        latitude: '51.5074',
        longitude: '-0.1278',
      });
      const ratehawk = makeHotel({
        hotelId: 'RH-001',
        name: 'Marriott London',
        destinationName: 'London',
        latitude: '51.6074', // ~11km away, exceeds 0.5km radius
        longitude: '-0.1278',
      });

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [hotelbeds] } },
        { provider: 'ratehawk', raw: { hotels: [ratehawk] } },
      ]);

      // 0.1 degree lat ≈ 11km, which exceeds the 0.5km radius
      expect(results).toHaveLength(2);
    });

    it('auto-groups hotels with close names and nearby lat/lng within radius', async () => {
      mappingRepo.findByProviderHotelIds.mockResolvedValue([]);

      const hotelbeds = makeHotel({
        hotelId: 'HB-001',
        name: 'Hilton Barcelona',
        destinationName: 'Barcelona',
        latitude: '41.3874',
        longitude: '2.1686',
      });
      const ratehawk = makeHotel({
        hotelId: 'RH-001',
        name: 'Hilton Barcelona',
        destinationName: 'Barcelona',
        latitude: '41.3876', // ~20m away
        longitude: '2.1688',
      });

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [hotelbeds] } },
        { provider: 'ratehawk', raw: { hotels: [ratehawk] } },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].providers).toHaveLength(2);
    });

    it('falls back properly when lat/lng not available on one hotel', async () => {
      mappingRepo.findByProviderHotelIds.mockResolvedValue([]);

      const hotelbeds = makeHotel({
        hotelId: 'HB-001',
        name: 'Hyatt Regency',
        destinationName: 'Dubai',
        latitude: '25.2048',
        longitude: '55.2708',
      });
      const ratehawk = makeHotel({
        hotelId: 'RH-001',
        name: 'Hyatt Regency',
        destinationName: 'Dubai',
        latitude: undefined,
        longitude: undefined,
      });

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [hotelbeds] } },
        { provider: 'ratehawk', raw: { hotels: [ratehawk] } },
      ]);

      // Lat/lng not available on one — should still group by name + city match
      expect(results).toHaveLength(1);
      expect(results[0].providers).toHaveLength(2);
    });
  });

  // ── Mixed: Explicit + Auto + Ungrouped ─────────────────────

  describe('mixed scenarios', () => {
    it('creates separate cards for explicitly mapped, auto-grouped, and ungrouped hotels', async () => {
      // Explicit mapping for one pair
      mappingRepo.findByProviderHotelIds.mockResolvedValue([
        makeMapping({ provider: 'hotelbeds', providerHotelId: '111', canonicalHotelId: 'canonical-ritz' }),
        makeMapping({ provider: 'ratehawk', providerHotelId: '222', canonicalHotelId: 'canonical-ritz' }),
      ]);

      const mappedHb = makeHotel({ hotelId: 'HB-001', providerHotelId: '111', name: 'The Ritz Paris', destinationName: 'Paris' });
      const mappedRh = makeHotel({ hotelId: 'RH-001', providerHotelId: '222', name: 'The Ritz Paris', destinationName: 'Paris' });
      const autoHb = makeHotel({ hotelId: 'HB-002', providerHotelId: '333', name: 'Marriott Paris Centre', destinationName: 'Paris', latitude: '48.8600', longitude: '2.3500' });
      const autoRh = makeHotel({ hotelId: 'RH-002', providerHotelId: '444', name: 'Marriott Paris Central', destinationName: 'Paris', latitude: '48.8601', longitude: '2.3498' });
      const unique = makeHotel({ hotelId: 'HB-003', providerHotelId: '555', name: 'Boutique Hotel Montmartre', destinationName: 'Paris' });

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [mappedHb, autoHb, unique] } },
        { provider: 'ratehawk', raw: { hotels: [mappedRh, autoRh] } },
      ]);

      // 1 mapped group + 1 auto-group + 1 ungrouped = 3 cards
      expect(results).toHaveLength(3);
      const ritzCard = results.find((c) => c.hotelGroupId === 'canonical-ritz');
      expect(ritzCard?.providers).toHaveLength(2);
      const marriottCard = results.find((c) => c.hotelGroupId.startsWith('auto:'));
      expect(marriottCard?.providers).toHaveLength(2);
      const boutiqueCard = results.find((c) => c.hotelGroupId.includes('555'));
      expect(boutiqueCard?.providers).toHaveLength(1);
    });
  });

  // ── Empty / Edge Cases ─────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty array when no results provided', async () => {
      mappingRepo.findByProviderHotelIds.mockResolvedValue([]);
      const results = await service.groupHotels([]);
      expect(results).toHaveLength(0);
    });

    it('returns empty array when results have no hotels', async () => {
      mappingRepo.findByProviderHotelIds.mockResolvedValue([]);
      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [] } },
      ]);
      expect(results).toHaveLength(0);
    });

    it('handles mappings load failure gracefully', async () => {
      mappingRepo.findByProviderHotelIds.mockRejectedValue(new Error('DB error'));

      const hotel = makeHotel({ hotelId: 'HB-001', name: 'Hotel Test', destinationName: 'Paris' });
      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [hotel] } },
      ]);

      // Falls back to showing as individual card even when mapping load fails
      expect(results).toHaveLength(1);
      expect(results[0].providers).toHaveLength(1);
    });

    it('sorts cards by min price ascending', async () => {
      mappingRepo.findByProviderHotelIds.mockResolvedValue([]);

      const cheap = makeHotel({ hotelId: 'HB-001', name: 'Budget Hotel', minRate: { rateId: 'r1', total: 100, currency: 'EUR' } });
      const expensive = makeHotel({ hotelId: 'HB-002', name: 'Luxury Hotel', minRate: { rateId: 'r2', total: 500, currency: 'EUR' } });
      const medium = makeHotel({ hotelId: 'HB-003', name: 'Mid Hotel', minRate: { rateId: 'r3', total: 250, currency: 'EUR' } });

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [expensive, cheap, medium] } },
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].minPrice?.amount).toBe(100);
      expect(results[1].minPrice?.amount).toBe(250);
      expect(results[2].minPrice?.amount).toBe(500);
    });

    it('computes min price across all providers in a group', async () => {
      mappingRepo.findByProviderHotelIds.mockResolvedValue([
        makeMapping({ provider: 'hotelbeds', providerHotelId: '111', canonicalHotelId: 'canonical-hotel' }),
        makeMapping({ provider: 'ratehawk', providerHotelId: '222', canonicalHotelId: 'canonical-hotel' }),
      ]);

      const hb = makeHotel({ hotelId: 'HB-001', providerHotelId: '111', name: 'Hotel', minRate: { rateId: 'r1', total: 300, currency: 'EUR' } });
      const rh = makeHotel({ hotelId: 'RH-001', providerHotelId: '222', name: 'Hotel', minRate: { rateId: 'r2', total: 200, currency: 'EUR' } });

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [hb] } },
        { provider: 'ratehawk', raw: { hotels: [rh] } },
      ]);

      expect(results[0].minPrice?.amount).toBe(200); // Lower of the two
      expect(results[0].minPrice?.currency).toBe('EUR');
    });

    it('includes provider summary with rateCount and minRate for each provider', async () => {
      mappingRepo.findByProviderHotelIds.mockResolvedValue([]);

      const hotel = makeHotel({
        hotelId: 'HB-001',
        name: 'Hotel Test',
        minRate: { rateId: 'r1', total: 150, currency: 'USD', boardName: 'Breakfast' },
        rates: [
          { rateId: 'r1', roomName: 'Standard', supplierAmount: 150, supplierCurrency: 'USD' },
          { rateId: 'r2', roomName: 'Deluxe', supplierAmount: 200, supplierCurrency: 'USD' },
        ],
        roomsCount: 2,
      });

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [hotel] } },
      ]);

      expect(results[0].providers[0]).toEqual({
        provider: 'hotelbeds',
        providerHotelId: 'HB-001',
        available: true,
        minRate: { rateId: 'r1', total: 150, currency: 'USD', boardName: 'Breakfast' },
        rateCount: 2,
      });
    });

    it('handles hotels without minRate or rates gracefully', async () => {
      mappingRepo.findByProviderHotelIds.mockResolvedValue([]);

      // Build hotel manually without minRate/rates to simulate missing pricing data
      const baseHotel = makeHotel({ hotelId: 'HB-001', name: 'Hotel No Pricing', roomsCount: 0 });
      const hotel: NormalizedHotelSummary = {
        ...baseHotel,
        minRate: undefined,
        rates: undefined,
      };

      const results = await service.groupHotels([
        { provider: 'hotelbeds', raw: { hotels: [hotel] } },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].minPrice).toBeUndefined();
      expect(results[0].providers[0].minRate).toBeUndefined();
      // rateCount is 0 because hotel has roomsCount=0 and no rates
      expect(results[0].providers[0].rateCount).toBe(0);
    });
  });
});
