/**
 * @deprecated Use the provider-neutral types from hotel-provider.types.ts instead.
 * This file contains Hotelbeds-specific types kept for backward compatibility
 * with the hotelbeds normalizer. New code should import from
 * 'modules/hotels/domain/types/hotel-provider.types'.
 */

export interface NormalizedHotelSearchResponse {
  provider: 'hotelbeds';
  hotels: NormalizedHotelOffer[];
  meta?: {
    total?: number;
    checkIn?: string;
    checkOut?: string;
  };
}

export interface NormalizedHotelRate {
  rateKey: string;
  roomName?: string;
  boardName?: string;
  paymentType?: string;
  net?: number;
  currency?: string;
  cancellationPolicyText?: string;
  /** True when the rate can be cancelled for free (zero-amount policies). */
  refundable?: boolean;
  /** Full structured cancellation policies from the supplier */
  cancellationPolicies?: Array<{
    amount?: string;
    from?: string;
    deadline?: string;
    policyType?: string;
    percentage?: string;
    numberOfNights?: number;
  }>;
  roomCode?: string;
  roomKey?: string;
  /** True when a multi-room merge couldn't find matching rates for all rooms. */
  partialMerge?: boolean;
  /** Occupancy this rate was priced for (from supplier response). */
  adults?: number;
  children?: number;
}

export interface NormalizedHotelOffer {
  hotelId: string;
  name: string;
  destinationCode?: string;
  destinationName?: string;
  zoneName?: string;
  categoryName?: string;
  latitude?: string;
  longitude?: string;

  rates: NormalizedHotelRate[];

  minRate?: {
    currency?: string;
    total: number;
    rateKey?: string;
    boardName?: string;
    paymentType?: string;
    cancellationPolicyText?: string;
    refundable?: boolean;
    cancellationPolicies?: Array<{
      amount?: string | number;
      from?: string;
      to?: string;
      deadline?: string;
      policyType?: string;
      percentage?: string | number;
      numberOfNights?: number;
    }>;
  };
  roomsCount: number;
}
