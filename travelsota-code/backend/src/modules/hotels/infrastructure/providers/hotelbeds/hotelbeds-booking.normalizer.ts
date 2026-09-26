import type {
  NormalizedBookedRoom,
  NormalizedHotelBookingResponse,
} from '../../../domain/entities/hotel-booking-response';

export function normalizeHotelbedsBookingResponse(data: any) {
  const booking = data?.booking;

  if (!booking) {
    return {
      provider: "hotelbeds",
      booking: null,
      raw: data,
    };
  }

  const hotel = booking.hotel;

  return {
    provider: "hotelbeds",

    booking: {
      reference: booking.reference,
      clientReference: booking.clientReference,
      status: booking.status,

      holder: booking.holder ?? {},

      hotel: hotel
        ? {
            hotelId: hotel.code,
            name: hotel.name,
            checkIn: hotel.checkIn,
            checkOut: hotel.checkOut,
            destinationName: hotel.destinationName,
            zoneName: hotel.zoneName,
          }
        : null,

      rooms:
        hotel?.rooms?.map((room: any) => ({
          id: room.id,
          name: room.name,
          status: room.status,

          paxes: room.paxes ?? [],

          rates: room.rates ?? [],
        })) ?? [],

      price: {
        totalNet: hotel?.totalNet ?? booking.totalNet ?? null,
        pendingAmount: booking.pendingAmount ?? null,
        currency: hotel?.currency ?? booking.currency ?? null,
      },

      cancellationAllowed:
        booking.modificationPolicies?.cancellation ?? false,

      modificationAllowed:
        booking.modificationPolicies?.modification ?? false,
    },
  };
}