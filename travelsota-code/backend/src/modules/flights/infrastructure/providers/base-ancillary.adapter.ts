/**
 * Base Ancillary Adapter — shared logic for all provider adapters.
 *
 * Subclasses implement:
 *   - getCatalog() → UnifiedAncillaryCatalog
 *   - refreshSeatForBooking() → SeatRefreshResult | null
 *
 * Shared methods (don't override):
 *   - buildPassengers()
 *   - buildError()
 *   - mapServiceType()
 */

import type {
  AncillaryPassenger,
  UnifiedAncillaryCatalog,
  UnifiedExtraService,
} from '../../domain/entities/unified-ancillary-catalog.types';

export abstract class BaseAncillaryAdapter {
  abstract readonly provider: string;

  protected buildPassengers(travelerCount: number): AncillaryPassenger[] {
    return Array.from({ length: travelerCount }, (_, i) => ({
      index: i,
      name: `Traveler ${i + 1}`,
      passengerType: 'ADT',
    }));
  }

  protected buildErrorResponse(
    searchKey: string,
    offerId: string,
    expiresAt: string,
    reason: string,
  ): UnifiedAncillaryCatalog {
    return {
      ok: false,
      status: 'error' as const,
      provider: this.provider as UnifiedAncillaryCatalog['provider'],
      offerId,
      searchKey,
      expiresAt,
      seats: [],
      baggage: { included: [], paid: [] },
      meals: [],
      services: [],
      passengers: [],
      unavailable: { seats: reason, paidBaggage: reason, meals: reason, services: reason },
      capabilities: { seatMap: false, paidBaggage: false, includedBaggage: false, meals: false, services: false },
    };
  }

  protected mapServiceType(type: string): UnifiedExtraService['type'] {
    switch (type) {
      case 'priority':
      case 'boarding':
        return 'priority';
      case 'lounge':
        return 'lounge';
      case 'wifi':
      case 'connectivity':
        return 'wifi';
      case 'sports_equipment':
      case 'equipment':
      case 'sport':
        return 'sports_equipment';
      case 'pet':
      case 'animal':
        return 'pet';
      default:
        return 'other';
    }
  }
}
