import { Test } from '@nestjs/testing';
import { FlightSearchAggregatorService } from './flight-search-aggregator.service';
import { FlightsProviderRegistryService } from './flights-provider-registry.service';
import { CacheService } from '../../../../shared/cache/cache.service';
import type { FlightProvider } from '../ports/flight-provider.interface';
import type { FlightSearchDto } from '../../api/dto/flight-search.dto';
import type { NormalizedFlightSearchResponse } from '../../domain/entities/flight-search-response';

describe('FlightSearchAggregatorService', () => {
  let service: FlightSearchAggregatorService;
  let registry: jest.Mocked<FlightsProviderRegistryService>;
  let cacheService: jest.Mocked<CacheService>;
  let travelportProvider: jest.Mocked<FlightProvider>;
  let duffelProvider: jest.Mocked<FlightProvider>;

  const searchDto: FlightSearchDto = {
    from: 'JFK',
    to: 'LHR',
    departureDate: '2026-08-15',
    tripType: 'one_way',
    adults: 1,
  };

  function makeOffer(id: string, provider: string, total: number) {
    return {
      id,
      provider,
      price: { currency: 'USD', base: total, taxes: 10, total: total + 10 },
      stops: 0,
      segments: [
        {
          id: `seg-${id}`,
          departure: { airport: 'JFK', date: '2026-08-15', time: '10:00' },
          arrival: { airport: 'LHR', date: '2026-08-15', time: '22:00' },
        },
      ],
    };
  }

  beforeEach(async () => {
    travelportProvider = {
      key: 'travelport',
      searchFlights: jest.fn(),
    } as any;

    duffelProvider = {
      key: 'duffel',
      searchFlights: jest.fn(),
    } as any;

    registry = {
      getSearchProviders: jest.fn(),
    } as any;

    cacheService = {
      set: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        FlightSearchAggregatorService,
        { provide: FlightsProviderRegistryService, useValue: registry },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get<FlightSearchAggregatorService>(FlightSearchAggregatorService);
    service.setProviderTimeoutMs(5000); // Lower timeout for tests
  });

  afterEach(() => jest.clearAllMocks());

  describe('aggregateSearch', () => {
    it('returns empty response with warning when no providers are enabled', async () => {
      registry.getSearchProviders.mockResolvedValue([]);

      const result = await service.aggregateSearch(searchDto);

      expect(result.offers).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('No flight search providers');
      expect(result.providerResults).toHaveLength(0);
      expect(result.searchKey).toBe('');
    });

    it('returns combined offers when both providers succeed', async () => {
      registry.getSearchProviders.mockResolvedValue([travelportProvider, duffelProvider]);

      travelportProvider.searchFlights.mockResolvedValue({
        provider: 'travelport',
        offers: [makeOffer('tp-1', 'travelport', 500)],
        warnings: [],
        request: {} as any,
      } as NormalizedFlightSearchResponse);

      duffelProvider.searchFlights.mockResolvedValue({
        provider: 'duffel',
        offers: [makeOffer('df-1', 'duffel', 450)],
        warnings: [],
        request: {} as any,
      } as NormalizedFlightSearchResponse);

      const result = await service.aggregateSearch(searchDto);

      expect(result.offers).toHaveLength(2);
      expect(result.warnings).toHaveLength(0);
      expect(result.providerResults).toHaveLength(2);
      expect(result.searchKey).toMatch(/^fs_/);
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('returns partial results when one provider fails', async () => {
      registry.getSearchProviders.mockResolvedValue([travelportProvider, duffelProvider]);

      travelportProvider.searchFlights.mockResolvedValue({
        provider: 'travelport',
        offers: [makeOffer('tp-1', 'travelport', 500)],
        warnings: [],
        request: {} as any,
      } as NormalizedFlightSearchResponse);

      duffelProvider.searchFlights.mockRejectedValue(new Error('Duffle API unreachable'));

      const result = await service.aggregateSearch(searchDto);

      expect(result.offers).toHaveLength(1);
      expect(result.offers[0].id).toBe('tp-1');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('duffel');
      expect(result.providerResults).toHaveLength(2);
      const duffelResult = result.providerResults.find((p) => p.provider === 'duffel');
      expect(duffelResult?.status).toBe('failed');
      expect(duffelResult?.errorMessage).toBe('Duffle API unreachable');
    });

    it('returns empty response with warning when all providers fail', async () => {
      registry.getSearchProviders.mockResolvedValue([travelportProvider, duffelProvider]);

      travelportProvider.searchFlights.mockRejectedValue(new Error('Travelport down'));
      duffelProvider.searchFlights.mockRejectedValue(new Error('Duffle down'));

      const result = await service.aggregateSearch(searchDto);

      expect(result.offers).toHaveLength(0);
      expect(result.warnings).toHaveLength(2);
      expect(result.providerResults).toHaveLength(2);
      expect(result.providerResults.every((p) => p.status === 'failed')).toBe(true);
    });

    it('returns result shape compatible with FlightResponseMapper.toSearchView', async () => {
      registry.getSearchProviders.mockResolvedValue([travelportProvider]);

      travelportProvider.searchFlights.mockResolvedValue({
        provider: 'travelport',
        offers: [makeOffer('tp-1', 'travelport', 500)],
        warnings: [],
        request: {} as any,
      } as NormalizedFlightSearchResponse);

      const result = await service.aggregateSearch(searchDto);

      // The mapper expects: raw.offers[], raw.warnings[], raw.meta.searchKey
      expect(Array.isArray(result.offers)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.searchKey).toBe('string');

      // Check that offers have the expected shape
      if (result.offers.length > 0) {
        const offer = result.offers[0];
        expect(offer.id).toBeDefined();
        expect(offer.price).toBeDefined();
        expect(typeof offer.price.total).toBe('number');
        expect(offer.price.currency).toBeDefined();
        expect(Array.isArray(offer.segments)).toBe(true);
      }
    });
  });
});
