import { Injectable, Logger } from '@nestjs/common';
import type { FlightsProviderKey } from '../../../settings/domain/provider-config.entity';
import type { FlightBookingProvider } from '../ports/flight-booking-provider.interface';

/**
 * Registry of FlightBookingProvider implementations.
 *
 * Follows the same registration-map pattern as FlightsProviderRegistryService.
 * Adapters register themselves in onModuleInit, and FlightBookingPublicService
 * resolves the correct provider by booking.provider.
 */
@Injectable()
export class FlightBookingProviderRegistryService {
  private readonly logger = new Logger(FlightBookingProviderRegistryService.name);
  private readonly providers = new Map<FlightsProviderKey, FlightBookingProvider>();

  register(provider: FlightBookingProvider): void {
    if (this.providers.has(provider.key)) {
      this.logger.warn(`Booking provider ${provider.key} already registered — overwriting`);
    }
    this.providers.set(provider.key, provider);
    this.logger.log(`Registered booking provider: ${provider.key}`);
  }

  getProvider(key: FlightsProviderKey): FlightBookingProvider {
    const provider = this.providers.get(key);
    if (!provider) {
      throw new Error(`No booking provider registered for key: ${key}`);
    }
    return provider;
  }

  hasProvider(key: FlightsProviderKey): boolean {
    return this.providers.has(key);
  }

  getAllProviders(): FlightsProviderKey[] {
    return Array.from(this.providers.keys());
  }
}
