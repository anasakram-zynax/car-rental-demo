import { apiRequest } from '@/lib/api/client';

export interface HotelBookingDetailResponse {
  id: string;
  publicRef?: string | null;
  provider: string;
  status: string;
  /** Real Payment record status (PENDING/AUTHORIZED/PAID/REFUNDED/CANCELLED) — independent of `status` above. */
  paymentStatus?: string | null;
  rateKey: string;
  holder: { name: string; surname: string };
  clientReference: string;
  paxes: Array<{ roomId: string; type: string; name: string; surname: string }>;
  amount: number;
  currency: string;
  customerAmount?: number | null;
  customerCurrency?: string | null;
  reference: string | null;
  supplierReference: string | null;
  supplierStatus: string | null;
  supplierOrderId: string | null;
  hotelConfirmationNumber: string | null;
  hotelConfirmationStatus: string | null;
  hotelStatus: string | null;
  hotel: Record<string, unknown> | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  rateSnapshot?: Record<string, unknown> | null;
}

export function getHotelBooking(bookingId: string) {
  return apiRequest<HotelBookingDetailResponse>(`/hotels/bookings/${bookingId}`, {
    method: 'GET',
    auth: true,
  });
}
