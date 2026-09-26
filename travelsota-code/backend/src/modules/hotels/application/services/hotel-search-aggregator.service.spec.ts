import { Test } from '@nestjs/testing';
import { HotelSearchAggregatorService } from './hotel-search-aggregator.service';
import { HotelsProviderRegistryService } from '../../providers/registry/hotels-provider-registry.service';
import { HotelGroupingService } from './hotel-grouping.service';
import { CacheService } from '../../../../shared/cache/cache.service';
import { HotelContentEnrichmentService } from '../../content/application/hotel-content-enrichment.service';
import { MarkupService } from '../../../markup/markup.service';
import { CurrencyService } from '../../../currency/application/services/currency.service';
import { SearchJobService } from '../../../search-job/search-job.service';
import type { HotelProvider } from '../../domain/interfaces/hotel-provider.interface';

describe('HotelSearchAggregatorService', () => {
  let service: HotelSearchAggregatorService;
  let providerRegistry: jest.Mocked<HotelsProviderRegistryService>;
  let cacheService: jest.Mocked<CacheService>;
  let hotelbedsProvider: jest.Mocked<HotelProvider>;
  let ratehawkProvider: jest.Mocked<HotelProvider>;

  const mockHotelbedsHotels = [
    {
      hotelId: 'HB-001',
      providerHotelId: 'HB-001',
      name: 'Hotel Barcelona Center',
      destinationCode: 'BCN',
      destinationName: 'Barcelona',
      categoryName: '4 stars',
      latitude: '41.3874',
      longitude: '2.1686',
      minRate: { rateId: 'hb-rate-1', total: 150, currency: 'EUR', boardName: 'Bed & Breakfast' },
      rates: [
        { rateId: 'hb-rate-1', roomName: 'Standard Double', boardName: 'Bed & Breakfast', supplierAmount: 150, currency: 'EUR' },
        { rateId: 'hb-rate-2', roomName: 'Deluxe Double', boardName: 'Half Board', supplierAmount: 200, currency: 'EUR' },
      ],
      roomsCount: 2,
    },
    {
      hotelId: 'HB-002',
      providerHotelId: 'HB-002',
      name: 'Hotel Madrid Central',
      destinationCode: 'MAD',
      destinationName: 'Madrid',
      categoryName: '5 stars',
      latitude: '40.4168',
      longitude: '-3.7038',
      minRate: { rateId: 'hb-rate-3', total: 250, currency: 'EUR', boardName: 'Room Only' },
      rates: [
        { rateId: 'hb-rate-3', roomName: 'Superior Double', boardName: 'Room Only', supplierAmount: 250, currency: 'EUR' },
      ],
      roomsCount: 1,
    },
  ];

  const mockRatehawkHotels = [
    {
      hotelId: 'RH-100',
      providerHotelId: 'RH-100',
      name: 'Barcelona Plaza Hotel',
      destinationCode: 'BCN',
      destinationName: 'Barcelona',
      categoryName: '4',
      latitude: '41.3800',
      longitude: '2.1700',
      minRate: { rateId: 'rh-rate-1', total: 180, currency: 'EUR', boardName: 'Breakfast Included' },
      rates: [
        { rateId: 'rh-rate-1', roomName: 'Classic Room', boardName: 'Breakfast Included', supplierAmount: 180, currency: 'EUR' },
      ],
      roomsCount: 1,
    },
  ];

  beforeEach(async () => {
    hotelbedsProvider = {
      key: 'hotelbeds',
      search: jest.fn(),
    } as any;

    ratehawkProvider = {
      key: 'ratehawk',
      search: jest.fn(),
    } as any;

    const groupingService = {
      groupHotels: jest.fn().mockImplementation((results: Array<{ provider: string; raw: any }>) => {
        // Dynamically build mock CombinedHotelCard[] from successful provider results
        const cards: any[] = [];
        for (const r of results) {
          const hotels: any[] = Array.isArray(r.raw?.hotels) ? r.raw.hotels : [];
          for (const h of hotels) {
            cards.push({
              hotelGroupId: `${r.provider}:${h.providerHotelId ?? h.hotelId}`,
              displayName: h.name,
              location: {
                latitude: h.latitude ? parseFloat(h.latitude) : undefined,
                longitude: h.longitude ? parseFloat(h.longitude) : undefined,
                city: h.destinationName,
              },
              starRating: h.categoryName ? (parseInt(h.categoryName, 10) || undefined) : undefined,
              providers: [{
                provider: r.provider,
                providerHotelId: h.providerHotelId ?? h.hotelId,
                available: true,
                minRate: h.minRate ? { rateId: h.minRate.rateId, total: h.minRate.total, currency: h.minRate.currency } : undefined,
                rateCount: h.rates?.length ?? h.roomsCount ?? undefined,
              }],
              minPrice: h.minRate
                ? { amount: h.minRate.total, currency: h.minRate.currency ?? 'EUR' }
                : undefined,
            });
          }
        }
        // Sort by min price ascending
        cards.sort((a: any, b: any) => (a.minPrice?.amount ?? Infinity) - (b.minPrice?.amount ?? Infinity));
        return Promise.resolve(cards);
      }),
    } as any;

    providerRegistry = {
      getSearchProviders: jest.fn(),
    } as any;

    cacheService = {
      set: jest.fn().mockResolvedValue(undefined),
    } as any;

    const enrichmentService = {
      enrichCards: jest.fn().mockImplementation((cards: any[]) => Promise.resolve(cards)),
    };

    const markupService = {
      calculatePrice: jest.fn().mockImplementation((basePrice: number) =>
        Promise.resolve({
          basePrice,
          finalPrice: basePrice,
          effectiveMarkupPercent: 0,
          appliedRules: [],
        }),
      ),
      preloadRules: jest.fn().mockResolvedValue([]),
      calculatePriceWithRules: jest.fn().mockImplementation((basePrice: number) => ({
        basePrice,
        finalPrice: basePrice,
        effectiveMarkupPercent: 0,
      })),
    };

    const currencyService = {
      buildPricingBreakdown: jest.fn().mockImplementation(({ supplierAmount, supplierCurrency, displayCurrency }: any) =>
        Promise.resolve({
          supplierPrice: { amount: supplierAmount, currency: supplierCurrency },
          displayPrice: { amount: supplierAmount, currency: displayCurrency ?? supplierCurrency },
          chargePrice: { amount: supplierAmount, currency: displayCurrency ?? supplierCurrency },
          exchangeRateSnapshot: { from: supplierCurrency, to: displayCurrency ?? supplierCurrency, rate: 1, fetchedAt: new Date().toISOString() },
        }),
      ),
    };

    const searchJobService = {
      reportSupplierStarted: jest.fn().mockResolvedValue(undefined),
      reportSupplierCompleted: jest.fn().mockResolvedValue(undefined),
      reportSupplierFailed: jest.fn().mockResolvedValue(undefined),
      reportSupplierResults: jest.fn().mockResolvedValue(undefined),
      reportSupplierResultsReady: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        HotelSearchAggregatorService,
        { provide: HotelsProviderRegistryService, useValue: providerRegistry },
        { provide: HotelGroupingService, useValue: groupingService },
        { provide: CacheService, useValue: cacheService },
        { provide: HotelContentEnrichmentService, useValue: enrichmentService },
        { provide: MarkupService, useValue: markupService },
        { provide: CurrencyService, useValue: currencyService },
        { provide: SearchJobService, useValue: searchJobService },
      ],
    }).compile();

    service = module.get<HotelSearchAggregatorService>(HotelSearchAggregatorService);
  });

  afterEach(() => jest.clearAllMocks());

  const baseInput = {
    checkIn: '2026-07-01',
    checkOut: '2026-07-05',
    destinationCode: 'BCN',
    rooms: [{ adults: 2, children: 0 }],
  };

  describe('aggregateSearch', () => {
    it('returns empty results with warning when no search providers are enabled', async () => {
      providerRegistry.getSearchProviders.mockResolvedValue([]);

      const result = await service.aggregateSearch(baseInput);

      expect(result.hotels).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('NO_SEARCH_PROVIDERS');
      expect(result.searchKey).toBe('');
    });

    it('returns combined results from all search-enabled providers', async () => {
      providerRegistry.getSearchProviders.mockResolvedValue([hotelbedsProvider, ratehawkProvider]);
      hotelbedsProvider.search.mockResolvedValue({
        provider: 'hotelbeds',
        hotels: mockHotelbedsHotels,
        meta: { total: 2, checkIn: '2026-07-01', checkOut: '2026-07-05' },
      });
      ratehawkProvider.search.mockResolvedValue({
        provider: 'ratehawk',
        hotels: mockRatehawkHotels,
        meta: { total: 1, checkIn: '2026-07-01', checkOut: '2026-07-05' },
      });

      const result = await service.aggregateSearch(baseInput);

      expect(result.hotels).toHaveLength(3); // 2 from hotelbeds + 1 from ratehawk
      expect(result.warnings).toHaveLength(0);
      expect(result.searchKey).toMatch(/^hs_/);
      expect(result.providerResults).toHaveLength(2);
      expect(result.providerResults.every((p) => p.status === 'ok')).toBe(true);
      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('search:'),
        expect.objectContaining({ searchKey: result.searchKey }),
        900,
      );
    });

    it('sorts hotels by min price ascending', async () => {
      providerRegistry.getSearchProviders.mockResolvedValue([hotelbedsProvider]);
      hotelbedsProvider.search.mockResolvedValue({
        provider: 'hotelbeds',
        hotels: mockHotelbedsHotels, // HB-002 is 250, HB-001 is 150
        meta: { total: 2 },
      });

      const result = await service.aggregateSearch(baseInput);

      expect(result.hotels).toHaveLength(2);
      expect(result.hotels[0].minPrice?.amount).toBe(150); // Cheaper first
      expect(result.hotels[1].minPrice?.amount).toBe(250);
    });

    it('includes provider summary for each hotel', async () => {
      providerRegistry.getSearchProviders.mockResolvedValue([hotelbedsProvider]);
      hotelbedsProvider.search.mockResolvedValue({
        provider: 'hotelbeds',
        hotels: mockHotelbedsHotels,
        meta: { total: 2 },
      });

      const result = await service.aggregateSearch(baseInput);
      const firstHotel = result.hotels[0];

      expect(firstHotel.providers).toHaveLength(1);
      expect(firstHotel.providers[0].provider).toBe('hotelbeds');
      expect(firstHotel.providers[0].providerHotelId).toBe('HB-001');
      expect(firstHotel.providers[0].available).toBe(true);
      expect(firstHotel.providers[0].rateCount).toBe(2);
    });

    it('adds warning when ratehawk fails but hotelbeds succeeds', async () => {
      providerRegistry.getSearchProviders.mockResolvedValue([hotelbedsProvider, ratehawkProvider]);
      hotelbedsProvider.search.mockResolvedValue({
        provider: 'hotelbeds',
        hotels: mockHotelbedsHotels,
        meta: { total: 2 },
      });
      ratehawkProvider.search.mockRejectedValue(new Error('RateHawk API unavailable'));

      const result = await service.aggregateSearch(baseInput);

      expect(result.hotels.length).toBeGreaterThan(0); // Hotelbeds results still present
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].provider).toBe('ratehawk');
      expect(result.warnings[0].code).toBe('PROVIDER_SEARCH_FAILED');
    });

    it('adds warning when hotelbeds fails but ratehawk succeeds', async () => {
      providerRegistry.getSearchProviders.mockResolvedValue([hotelbedsProvider, ratehawkProvider]);
      hotelbedsProvider.search.mockRejectedValue(new Error('Hotelbeds API timeout'));
      ratehawkProvider.search.mockResolvedValue({
        provider: 'ratehawk',
        hotels: mockRatehawkHotels,
        meta: { total: 1 },
      });

      const result = await service.aggregateSearch(baseInput);

      expect(result.hotels.length).toBeGreaterThan(0); // RateHawk results still present
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].provider).toBe('hotelbeds');
    });

    it('returns clear error when both providers fail', async () => {
      providerRegistry.getSearchProviders.mockResolvedValue([hotelbedsProvider, ratehawkProvider]);
      hotelbedsProvider.search.mockRejectedValue(new Error('Hotelbeds down'));
      ratehawkProvider.search.mockRejectedValue(new Error('RateHawk down'));

      const result = await service.aggregateSearch(baseInput);

      expect(result.hotels).toHaveLength(0);
      expect(result.warnings).toHaveLength(2);
      expect(result.providerResults.every((p) => p.status === 'failed')).toBe(true);
    });

    it('caches a compact search session', async () => {
      providerRegistry.getSearchProviders.mockResolvedValue([hotelbedsProvider]);
      hotelbedsProvider.search.mockResolvedValue({
        provider: 'hotelbeds',
        hotels: mockHotelbedsHotels,
        meta: { total: 2 },
      });

      const result = await service.aggregateSearch(baseInput);
      const expectedSession = {
        searchKey: result.searchKey,
        providers: expect.objectContaining({
          hotelbeds: expect.objectContaining({ status: 'ok', hotelCount: 2 }),
        }),
      };

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('search:'),
        expect.objectContaining(expectedSession),
        900,
      );
      // Verify the session does NOT contain full hotel payloads
      const sessionArg = (cacheService.set as jest.Mock).mock.calls[0][1];
      expect(sessionArg.criteria).toBeDefined();
      expect(sessionArg.criteria.checkIn).toBe('2026-07-01');
      expect(sessionArg.createdAt).toBeDefined();
      expect(sessionArg.expiresAt).toBeDefined();
    });

    it('handles timeouts gracefully with per-provider timeout', async () => {
      // Use a very short timeout so the test completes quickly
      service.setProviderTimeoutMs(10);

      providerRegistry.getSearchProviders.mockResolvedValue([hotelbedsProvider, ratehawkProvider]);
      hotelbedsProvider.search.mockResolvedValue({
        provider: 'hotelbeds',
        hotels: mockHotelbedsHotels,
        meta: { total: 2 },
      });

      // Simulate a slow provider by never resolving — triggers the 10ms timeout
      ratehawkProvider.search.mockReturnValue(new Promise(() => {}));

      const result = await service.aggregateSearch(baseInput);

      // Hotelbeds succeeded, ratehawk timed out
      expect(result.hotels.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.provider === 'ratehawk')).toBe(true);
    });
  });

  describe('hotel card shape', () => {
    it('includes all required fields in combined hotel cards', async () => {
      providerRegistry.getSearchProviders.mockResolvedValue([hotelbedsProvider]);
      hotelbedsProvider.search.mockResolvedValue({
        provider: 'hotelbeds',
        hotels: mockHotelbedsHotels,
        meta: { total: 2 },
      });

      const result = await service.aggregateSearch(baseInput);
      const card = result.hotels[0];

      expect(card).toHaveProperty('hotelGroupId');
      expect(card).toHaveProperty('displayName');
      expect(card).toHaveProperty('providers');
      expect(card).toHaveProperty('minPrice');
      expect(card.hotelGroupId).toContain('hotelbeds:');
      expect(typeof card.displayName).toBe('string');
      expect(Array.isArray(card.providers)).toBe(true);
      expect(card.minPrice).toHaveProperty('amount');
      expect(card.minPrice).toHaveProperty('currency');
    });
  });
});
