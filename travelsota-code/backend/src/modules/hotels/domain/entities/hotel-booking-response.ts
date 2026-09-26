/**
 * @deprecated Use the provider-neutral types from hotel-provider.types.ts instead.
 * This file contains Hotelbeds-specific types kept for backward compatibility
 * with the hotelbeds-booking normalizer.
 */

export interface NormalizedHotelBookingResponse {
  provider: 'hotelbeds';

  booking: {
    reference: string;
    clientReference?: string;
    status: string;
    creationDate?: string;

    holder: {
      name: string;
      surname: string;
    };

    hotel: {
      hotelId: string;
      name: string;
      destinationCode?: string;
      destinationName?: string;
      zoneName?: string;
      categoryName?: string;
      checkIn?: string;
      checkOut?: string;
    } | null;

    rooms: NormalizedBookedRoom[];

    price: {
      currency?: string;
      totalNet: number | null;
      pendingAmount?: number;
    };

    cancellationAllowed: boolean;
    modificationAllowed: boolean;
  } | null;
  raw?: unknown;
}

export interface NormalizedBookedRoom {
  roomId: number;

  roomCode?: string;
  roomName?: string;

  adults: number;
  children: number;

  boardName?: string;

  rateKey?: string;

  cancellationPolicyText?: string;
}
