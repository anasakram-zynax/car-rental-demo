import { Test } from '@nestjs/testing';
import { HotelsProviderRegistryService } from './hotels-provider-registry.service';
import { ProviderConfigService } from '../../../settings/application/services/provider-config.service';
import { BusinessError } from '../../../../shared/errors/business-error';
import type { HotelProvider } from '../../domain/interfaces/hotel-provider.interface';

describe('HotelsProviderRegistryService', () => {
  let service: HotelsProviderRegistryService;
  let configService: jest.Mocked<ProviderConfigService>;
  let hotelbedsProvider: jest.Mocked<HotelProvider>;

  beforeEach(async () => {
    configService = {
      findAll: jest.fn(),
    } as any;

    hotelbedsProvider = {
      key: 'hotelbeds',
      checkStatus: jest.fn(),
      search: jest.fn(),
      getHotelDetails: jest.fn(),
      validateRate: jest.fn(),
      createBooking: jest.fn(),
      retrieveBooking: jest.fn(),
      cancelBooking: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        HotelsProviderRegistryService,
        { provide: ProviderConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<HotelsProviderRegistryService>(HotelsProviderRegistryService);
    service.register(hotelbedsProvider);
  });

  afterEach(() => jest.clearAllMocks());

  describe('resolveActiveProvider', () => {
    it('returns the registered provider when enabled with valid config', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'hotels', provider: 'hotelbeds', enabled: true, config: { endpoint: 'https://api.test.hotelbeds.com', apiKey: 'test-key', secret: 'test-secret' }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.resolveActiveProvider();

      expect(result).toBe(hotelbedsProvider);
      expect(result.key).toBe('hotelbeds');
    });

    it('throws HOTELS_PROVIDER_DISABLED when no hotel provider is enabled', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'hotels', provider: 'hotelbeds', enabled: false, config: null, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      await expect(service.resolveActiveProvider()).rejects.toThrow(BusinessError);
    });

    it('throws HOTELS_PROVIDER_DISABLED when no configs exist at all', async () => {
      configService.findAll.mockResolvedValue([]);

      await expect(service.resolveActiveProvider()).rejects.toThrow(BusinessError);
    });

    it('returns first enabled provider when multiple hotel providers are enabled (no longer throws)', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'hotels', provider: 'hotelbeds', enabled: true, config: { endpoint: '...', apiKey: 'k', secret: 's' }, updatedAt: '2026-01-01T00:00:00Z' },
        { module: 'hotels', provider: 'ratehawk', enabled: true, config: { baseUrl: '...', keyId: 'k', apiKey: 'k' }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.resolveActiveProvider();
      expect(result).toBe(hotelbedsProvider);
    });

    it('throws HOTELS_PROVIDER_MISCONFIGURED when provider is not registered', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'hotels', provider: 'ratehawk', enabled: true, config: { baseUrl: '...', keyId: 'k', apiKey: 'k' }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      await expect(service.resolveActiveProvider()).rejects.toThrow(BusinessError);
    });

    it('resolves even when config has minimal fields (validation moved to config service)', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'hotels', provider: 'hotelbeds', enabled: true, config: { endpoint: 'https://api.test.hotelbeds.com' }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.resolveActiveProvider();
      expect(result).toBe(hotelbedsProvider);
    });
  });

  describe('register / getRegisteredProviders', () => {
    it('registers a provider and returns it in the list', () => {
      expect(service.getRegisteredProviders()).toContain('hotelbeds');
    });

    it('isRegistered returns true for registered providers', () => {
      expect(service.isRegistered('hotelbeds')).toBe(true);
      expect(service.isRegistered('ratehawk')).toBe(false);
    });
  });

  describe('getProvider', () => {
    it('returns the registered provider by key', () => {
      const result = service.getProvider('hotelbeds');
      expect(result.key).toBe('hotelbeds');
    });

    it('throws NotFoundException for unregistered provider', async () => {
      expect(() => service.getProvider('ratehawk')).toThrow();
    });
  });

  describe('getSearchProviders', () => {
    it('returns enabled providers with searchEnabled = true', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'hotels', provider: 'hotelbeds', enabled: true, config: { endpoint: '...', apiKey: 'k', secret: 's', searchEnabled: true }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.getSearchProviders();
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('hotelbeds');
    });

    it('excludes provider with searchEnabled = false', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'hotels', provider: 'hotelbeds', enabled: true, config: { endpoint: '...', apiKey: 'k', secret: 's', searchEnabled: false }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.getSearchProviders();
      expect(result).toHaveLength(0);
    });

    it('includes provider without searchEnabled field (backward compat)', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'hotels', provider: 'hotelbeds', enabled: true, config: { endpoint: '...', apiKey: 'k', secret: 's' }, updatedAt: '2026-01-01T00:00:00Z' },
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
        { module: 'hotels', provider: 'hotelbeds', enabled: true, config: { endpoint: '...', apiKey: 'k', secret: 's', bookingEnabled: true }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.getBookingProviders();
      expect(result).toHaveLength(1);
    });

    it('excludes provider with bookingEnabled = false', async () => {
      configService.findAll.mockResolvedValue([
        { module: 'hotels', provider: 'hotelbeds', enabled: true, config: { bookingEnabled: false }, updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      const result = await service.getBookingProviders();
      expect(result).toHaveLength(0);
    });
  });
});
