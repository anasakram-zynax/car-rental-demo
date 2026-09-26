import { apiRequest } from '@/lib/api/client';

export interface RefundQuoteResponse {
  ok: boolean;
  refundable: boolean;
  refundAmount?: number;
  refundCurrency?: string;
  penaltyAmount?: number;
  penaltyCurrency?: string;
  reason?: string;
  message?: string;
}

export interface RefundRequestResponse {
  bookingId: string;
  status: string;
}

export function quoteRefund(bookingId: string) {
  return apiRequest<RefundQuoteResponse>(
    `/flights/bookings/${encodeURIComponent(bookingId)}/refund-quote`,
    {
      method: 'POST',
      auth: true,
    },
  );
}

export function requestRefund(bookingId: string, reason?: string) {
  return apiRequest<RefundRequestResponse>(
    `/flights/bookings/${encodeURIComponent(bookingId)}/refund-request`,
    {
      method: 'POST',
      body: { reason },
      auth: true,
    },
  );
}
