import { apiRequest } from '@/lib/api/client';

export interface VoidBookingResponse {
  bookingId: string;
  status: string;
}

export function voidBooking(bookingId: string, reason?: string) {
  return apiRequest<VoidBookingResponse>(
    `/flights/bookings/${encodeURIComponent(bookingId)}/void`,
    {
      method: 'POST',
      body: { reason },
      auth: true,
    },
  );
}
