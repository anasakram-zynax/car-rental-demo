import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import { ProviderConfigService } from '../../../settings/application/services/provider-config.service';
import type { HotelProvider } from '../../domain/interfaces/hotel-provider.interface';
import type { ProviderConfigRecord } from '../../../settings/domain/provider-config.entity';

export const HOTELS_PROVIDER_REGISTRY_TOKEN = Symbol('HOTELS_PROVIDER_REGISTRY');

@Injectable()
export class HotelsProviderRegistryService {
  private readonly logger = new Logger(HotelsProviderRegistryService.name);
  private readonly registeredProviders = new Map<string, HotelProvider>();
  private cachedSearchProviders: { providers: HotelProvider[]; fetchedAt: number } | null = null;
  private cachedBookingProviders: { providers: HotelProvider[]; fetchedAt: number } | null = null;
  // WS3.4: 30s TTL meant most searches paid a fresh DB round-trip for
  // provider discovery (measured 3.4s on demo job creation). Enablement
  // changes are rare + admin-triggered, and every write path can invalidate
  // via invalidateCaches(), so 5 minutes is safe.
  private readonly PROVIDER_CACHE_TTL_MS = 300_000;

  constructor(
    private readonly providerConfigService: ProviderConfigService,
  ) {}

  /**
   * Drop the in-memory provider caches. Call after any admin change to
   * provider enablement/credentials so the next search re-reads the DB
   * instead of waiting out the 5-minute TTL (WS3.4).
   */
  invalidateCaches(): void {
    this.cachedSearchProviders = null;
    this.cachedBookingProviders = null;
  }

  /**
   * Register a hotel provider implementation.
   * Called during module initialization for each available provider.
   */
  register(provider: HotelProvider): void {
    const key = provider.key;
    if (this.registeredProviders.has(key)) {
      this.logger.warn(`Hotel provider "${key}" is already registered. Overwriting.`);
    }
    this.registeredProviders.set(key, provider);
    this.logger.log(`Registered hotel provider: ${key}`);
  }

  /**
   * Get a provider implementation by its key.
   * Throws if the provider is not registered.
   */
  getProvider(key: string): HotelProvider {
    const provider = this.registeredProviders.get(key);
    if (!provider) {
      throw new NotFoundException(
        `Hotel provider "${key}" is not registered. Available: ${[...this.registeredProviders.keys()].join(', ') || 'none'}`,
      );
    }
    return provider;
  }

  /**
   * Resolve the currently active hotel provider.
   *
   * @deprecated Use getSearchProviders() or getBookingProviders() instead.
   * Kept for transitional backward compatibility.
   * Returns the first enabled provider, or throws if none enabled.
   */
  async resolveActiveProvider(): Promise<HotelProvider> {
    const configs = await this.providerConfigService.findAll();
    const hotelConfigs = configs.filter(
      (c) => c.module === 'hotels' && c.enabled,
    ) as ProviderConfigRecord[];

    if (hotelConfigs.length === 0) {
      throw new BusinessError(
        'HOTELS_PROVIDER_DISABLED',
        'No hotel provider is enabled. Please configure and enable a hotel provider in admin settings.',
      );
    }

    const activeConfig = hotelConfigs[0];
    const provider = this.registeredProviders.get(activeConfig.provider);

    if (!provider) {
      throw new BusinessError(
        'HOTELS_PROVIDER_MISCONFIGURED',
        `Hotel provider "${activeConfig.provider}" is not registered. Available providers: ${[...this.registeredProviders.keys()].join(', ') || 'none'}`,
      );
    }

    this.logger.debug(`Resolved active hotel provider: ${provider.key}`);
    return provider;
  }

  /**
   * Get all enabled hotel providers that have searchEnabled = true.
   * Results are cached in-memory for 30s so repeated calls within the same
   * search job do not hit DB twice.
   */
  async getSearchProviders(): Promise<HotelProvider[]> {
    if (this.cachedSearchProviders && (Date.now() - this.cachedSearchProviders.fetchedAt) < this.PROVIDER_CACHE_TTL_MS) {
      return this.cachedSearchProviders.providers;
    }
    const providers = await this.getEnabledProvidersWithField('searchEnabled');
    this.cachedSearchProviders = { providers, fetchedAt: Date.now() };
    this.logger.log(`[Registry] Search providers (${providers.length}): ${providers.map((p) => p.key).join(', ') || 'none'}`);
    return providers;
  }

  /**
   * Get all enabled hotel providers that have bookingEnabled = true.
   * Results are cached in-memory for 30s.
   */
  async getBookingProviders(): Promise<HotelProvider[]> {
    if (this.cachedBookingProviders && (Date.now() - this.cachedBookingProviders.fetchedAt) < this.PROVIDER_CACHE_TTL_MS) {
      return this.cachedBookingProviders.providers;
    }
    const providers = await this.getEnabledProvidersWithField('bookingEnabled');
    this.cachedBookingProviders = { providers, fetchedAt: Date.now() };
    return providers;
  }

  /**
   * Get all enabled hotel providers regardless of search/booking flags.
   */
  async getAllEnabledProviders(): Promise<HotelProvider[]> {
    return this.getEnabledProvidersWithField(null);
  }

  private async getEnabledProvidersWithField(field: 'searchEnabled' | 'bookingEnabled' | null): Promise<HotelProvider[]> {
    const configs = await this.providerConfigService.findAll();
    const hotelConfigs = configs.filter(
      (c) => c.module === 'hotels' && c.enabled,
    ) as ProviderConfigRecord[];

    const providers: HotelProvider[] = [];

    for (const config of hotelConfigs) {
      const provider = this.registeredProviders.get(config.provider);
      if (!provider) {
        this.logger.warn(`Skipping unregistered hotel provider: ${config.provider}`);
        continue;
      }

      if (field) {
        const cfg = (config.config ?? {}) as Record<string, unknown>;
        if (cfg[field] === false) {
          continue;
        }
      }

      providers.push(provider);
    }

    return providers;
  }

  /**
   * Get a list of all registered provider keys.
   */
  getRegisteredProviders(): string[] {
    return [...this.registeredProviders.keys()];
  }

  /**
   * Check if a specific provider is registered.
   */
  isRegistered(key: string): boolean {
    return this.registeredProviders.has(key);
  }
}
