import { Test } from '@nestjs/testing';
import { FlightsProviderRegistryService } from './flights-provider-registry.service';
import { ProviderConfigService } from '../../../settings/application/services/provider-config.service';
import { BusinessError } from '../../../../shared/errors/business-error';
import type { FlightProvider } from '../ports/flight-provider.interface';

describe('FlightsProviderRegistryService', () => {
  let service: FlightsProviderRegistryService;
  let configService: jest.Mocked<ProviderConfigService>;
  let travelportProvider: jest.Mocked<FlightProvider>;

  beforeEach(async () => {
    configService = {
      findAll: jest.fn(),
    } as any;

    travelportProvider = {
      key: 'travelport',
      searchFlights: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        FlightsProviderRegistryService,
        { provide: ProviderConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<FlightsProviderRegistryService>(FlightsProviderRegistryService);
    service.register(travelportProvider);
  });

  afterEach(() => jest.clearAllMocks());

  describe('resolveActiveProvider', () => {
    it('returns the registered provider when enabled', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'flights', provider: 'travelport', enabled: true, config: { baseUrl: 'https://api.example.com' }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.resolveActiveProvider();
      expect(result).toBe(travelportProvider);
      expect(result.key).toBe('travelport');
    });

    it('throws FLIGHTS_PROVIDER_DISABLED when no flight provider is enabled', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'flights', provider: 'travelport', enabled: false, config: null, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      await expect(service.resolveActiveProvider()).rejects.toThrow(BusinessError);
    });

    it('throws FLIGHTS_PROVIDER_DISABLED when no configs exist at all', async () => {
      configService.findAll.mockResolvedValue([]);
      await expect(service.resolveActiveProvider()).rejects.toThrow(BusinessError);
    });

    it('returns first enabled provider when multiple are enabled', async () => {
      const duffelProvider: jest.Mocked<FlightProvider> = {
        key: 'duffel',
        searchFlights: jest.fn(),
      } as any;
      service.register(duffelProvider);

      configService.findAll.mockResolvedValue([
        { module: 'flights', provider: 'travelport', enabled: true, config: { baseUrl: '...' }, updatedAt: '2026-01-01T00:00:00Z' },
        { module: 'flights', provider: 'duffel', enabled: true, config: { baseUrl: '...' }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.resolveActiveProvider();
      expect(result).toBe(travelportProvider);
    });

    it('throws FLIGHTS_PROVIDER_MISCONFIGURED when provider is not registered', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'flights', provider: 'duffel', enabled: true, config: { baseUrl: '...' }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      await expect(service.resolveActiveProvider()).rejects.toThrow(BusinessError);
    });
  });

  describe('register / getRegisteredProviders', () => {
    it('registers a provider and returns it in the list', () => {
      expect(service.getRegisteredProviders()).toContain('travelport');
    });

    it('isRegistered returns true for registered providers', () => {
      expect(service.isRegistered('travelport')).toBe(true);
      expect(service.isRegistered('duffel')).toBe(false);
    });
  });

  describe('getProvider', () => {
    it('returns the registered provider by key', () => {
      const result = service.getProvider('travelport');
      expect(result.key).toBe('travelport');
    });

    it('throws NotFoundException for unregistered provider', () => {
      expect(() => service.getProvider('duffel')).toThrow();
    });
  });

  describe('getSearchProviders', () => {
    it('returns enabled providers with searchEnabled = true', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'flights', provider: 'travelport', enabled: true, config: { searchEnabled: true }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.getSearchProviders();
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('travelport');
    });

    it('excludes provider with searchEnabled = false', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'flights', provider: 'travelport', enabled: true, config: { searchEnabled: false }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.getSearchProviders();
      expect(result).toHaveLength(0);
    });

    it('includes provider without searchEnabled field (backward compat)', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'flights', provider: 'travelport', enabled: true, config: {}, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.getSearchProviders();
      expect(result).toHaveLength(1);
    });

    it('returns empty array when no providers are enabled', async () => {
      configService.findAll.mockResolvedValue([]);
      const result = await service.getSearchProviders();
      expect(result).toHaveLength(0);
    });
  });

  describe('getBookingProviders', () => {
    it('returns enabled providers with bookingEnabled = true', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'flights', provider: 'travelport', enabled: true, config: { bookingEnabled: true }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.getBookingProviders();
      expect(result).toHaveLength(1);
    });

    it('excludes provider with bookingEnabled = false', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'flights', provider: 'travelport', enabled: true, config: { bookingEnabled: false }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.getBookingProviders();
      expect(result).toHaveLength(0);
    });
  });
});
