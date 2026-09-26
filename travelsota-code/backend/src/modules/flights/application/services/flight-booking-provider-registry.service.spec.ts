import { Test, TestingModule } from '@nestjs/testing';
import { FlightBookingProviderRegistryService } from './flight-booking-provider-registry.service';
import type { FlightBookingProvider } from '../ports/flight-booking-provider.interface';
import type { FlightsProviderKey } from '../../../settings/domain/provider-config.entity';

describe('FlightBookingProviderRegistryService', () => {
  let registry: FlightBookingProviderRegistryService;
  let mockTravelportProvider: FlightBookingProvider;
  let mockDuffleProvider: FlightBookingProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FlightBookingProviderRegistryService],
    }).compile();

    registry = module.get<FlightBookingProviderRegistryService>(
      FlightBookingProviderRegistryService,
    );

    mockTravelportProvider = {
      key: 'travelport' as FlightsProviderKey,
      confirmBooking: jest.fn().mockResolvedValue({ ok: true, locatorCode: 'ABC123' }),
      ticketBooking: jest.fn().mockResolvedValue({ ok: true, locatorCode: 'ABC123', ticketNumbers: ['TKT001'] }),
      reprice: jest.fn().mockResolvedValue({ amount: 500, currency: 'USD' }),
      cancelBooking: jest.fn().mockResolvedValue({ ok: true, supplierStatus: 'cancelled' }),
    };

    mockDuffleProvider = {
      key: 'duffel' as FlightsProviderKey,
      confirmBooking: jest.fn().mockResolvedValue({ ok: false, message: 'Not implemented' }),
    };
  });

  describe('register', () => {
    it('should register a provider', () => {
      registry.register(mockTravelportProvider);
      expect(registry.hasProvider('travelport')).toBe(true);
    });

    it('should overwrite an existing registration', () => {
      registry.register(mockTravelportProvider);
      registry.register(mockTravelportProvider); // should not throw
      expect(registry.hasProvider('travelport')).toBe(true);
    });
  });

  describe('getProvider', () => {
    it('should return a registered provider', () => {
      registry.register(mockTravelportProvider);
      const provider = registry.getProvider('travelport');
      expect(provider.key).toBe('travelport');
    });

    it('should throw for unregistered provider', () => {
      expect(() => registry.getProvider('travelport')).toThrow(
        'No booking provider registered for key: travelport',
      );
    });
  });

  describe('hasProvider', () => {
    it('should return true for registered provider', () => {
      registry.register(mockTravelportProvider);
      expect(registry.hasProvider('travelport')).toBe(true);
    });

    it('should return false for unregistered provider', () => {
      expect(registry.hasProvider('duffel')).toBe(false);
    });
  });

  describe('getAllProviders', () => {
    it('should return all registered provider keys', () => {
      registry.register(mockTravelportProvider);
      registry.register(mockDuffleProvider);
      const keys = registry.getAllProviders();
      expect(keys).toContain('travelport');
      expect(keys).toContain('duffel');
    });

    it('should return empty array when no providers registered', () => {
      expect(registry.getAllProviders()).toEqual([]);
    });
  });

  describe('integration with providers', () => {
    it('should route confirmBooking to the correct provider', async () => {
      registry.register(mockTravelportProvider);
      const provider = registry.getProvider('travelport');
      const result = await provider.confirmBooking({
        bookingId: 'b1',
        provider: 'travelport',
        travelers: [],
      });
      expect(result.ok).toBe(true);
      expect(result.locatorCode).toBe('ABC123');
    });

    it('should route ticketBooking to the correct provider', async () => {
      registry.register(mockTravelportProvider);
      const provider = registry.getProvider('travelport');
      const result = await provider.ticketBooking!('LOC123', {
        bookingId: 'b1',
        provider: 'travelport',
        travelers: [],
      });
      expect(result.ok).toBe(true);
      expect(result.ticketNumbers).toEqual(['TKT001']);
    });
  });
});
