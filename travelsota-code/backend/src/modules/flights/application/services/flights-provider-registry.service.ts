import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ProviderConfigService } from '../../../settings/application/services/provider-config.service';
import { BusinessError } from '../../../../shared/errors/business-error';
import type { FlightProvider } from '../ports/flight-provider.interface';
import type { ProviderConfigRecord } from '../../../settings/domain/provider-config.entity';

@Injectable()
export class FlightsProviderRegistryService {
  private readonly logger = new Logger(FlightsProviderRegistryService.name);
  private readonly registeredProviders = new Map<string, FlightProvider>();
  private cachedSearchProviders: { providers: FlightProvider[]; fetchedAt: number } | null = null;
  private cachedBookingProviders: { providers: FlightProvider[]; fetchedAt: number } | null = null;
  private readonly PROVIDER_CACHE_TTL_MS = 30_000;

  constructor(
    private readonly providerConfigService: ProviderConfigService,
  ) {}

  /**
   * Register a flight provider implementation.
   * Called during module initialization for each available provider.
   */
  register(provider: FlightProvider): void {
    const key = provider.key;
    if (this.registeredProviders.has(key)) {
      this.logger.warn(`Flight provider "${key}" is already registered. Overwriting.`);
    }
    this.registeredProviders.set(key, provider);
    this.logger.log(`Registered flight provider: ${key}`);
  }

  /**
   * Get a provider implementation by its key.
   * Throws if the provider is not registered.
   */
  getProvider(key: string): FlightProvider {
    const provider = this.registeredProviders.get(key);
    if (!provider) {
      throw new NotFoundException(
        `Flight provider "${key}" is not registered. Available: ${[...this.registeredProviders.keys()].join(', ') || 'none'}`,
      );
    }
    return provider;
  }

  /**
   * Resolve the currently active flight provider.
   *
   * @deprecated Use getSearchProviders() or getBookingProviders() instead.
   * Kept for transitional backward compatibility.
   * Returns the first enabled provider, or throws if none enabled.
   */
  async resolveActiveProvider(): Promise<FlightProvider> {
    const configs = await this.providerConfigService.findAll();
    const flightConfigs = configs.filter(
      (c) => c.module === 'flights' && c.enabled,
    ) as ProviderConfigRecord[];

    if (flightConfigs.length === 0) {
      throw new BusinessError(
        'FLIGHTS_PROVIDER_DISABLED',
        'No flight provider is enabled. Please configure and enable a flight provider in admin settings.',
      );
    }

    // Skip configs for providers that have no registered implementation (e.g. amadeus seeded but not built)
    for (const config of flightConfigs) {
      const provider = this.registeredProviders.get(config.provider);
      if (provider) return provider;
    }

    throw new BusinessError(
      'FLIGHTS_PROVIDER_MISCONFIGURED',
      `No enabled flight provider has a registered implementation. Enabled providers: ${flightConfigs.map(c => c.provider).join(', ') || 'none'}. Registered: ${[...this.registeredProviders.keys()].join(', ') || 'none'}`,
    );
  }

  /**
   * Get all enabled flight providers that have searchEnabled = true.
   * Results are cached in-memory for 30s so repeated calls within the same
   * search job (createSearchJob → aggregateSearch) do not hit DB twice.
   */
  async getSearchProviders(): Promise<FlightProvider[]> {
    if (this.cachedSearchProviders && (Date.now() - this.cachedSearchProviders.fetchedAt) < this.PROVIDER_CACHE_TTL_MS) {
      return this.cachedSearchProviders.providers;
    }
    const providers = await this.getEnabledProvidersWithField('searchEnabled');
    this.cachedSearchProviders = { providers, fetchedAt: Date.now() };
    return providers;
  }

  /**
   * Get all enabled flight providers that have bookingEnabled = true.
   * Results are cached in-memory for 30s.
   */
  async getBookingProviders(): Promise<FlightProvider[]> {
    if (this.cachedBookingProviders && (Date.now() - this.cachedBookingProviders.fetchedAt) < this.PROVIDER_CACHE_TTL_MS) {
      return this.cachedBookingProviders.providers;
    }
    const providers = await this.getEnabledProvidersWithField('bookingEnabled');
    this.cachedBookingProviders = { providers, fetchedAt: Date.now() };
    return providers;
  }

  /**
   * Get all enabled flight providers regardless of search/booking flags.
   */
  async getAllEnabledProviders(): Promise<FlightProvider[]> {
    return this.getEnabledProvidersWithField(null);
  }

  private async getEnabledProvidersWithField(field: 'searchEnabled' | 'bookingEnabled' | null): Promise<FlightProvider[]> {
    const configs = await this.providerConfigService.findAll();
    const flightConfigs = configs.filter(
      (c) => c.module === 'flights' && c.enabled,
    ) as ProviderConfigRecord[];

    if (flightConfigs.length === 0) {
      return [];
    }

    const providers: FlightProvider[] = [];

    for (const config of flightConfigs) {
      const provider = this.registeredProviders.get(config.provider);
      if (!provider) {
        this.logger.warn(`Skipping unregistered flight provider: ${config.provider}`);
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
