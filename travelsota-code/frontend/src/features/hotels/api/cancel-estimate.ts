import { apiRequest } from "@/lib/api/client";

export interface CancelEstimateResponse {
  bookingId: string;
  bookingType: string;
  status: string;
  totalAmount: number;
  currency: string;
  cancellationFee: number | null;
  refundAmount: number | null;
  isFreeCancellation: boolean;
  policyDescription: string | null;
  policiesKnown?: boolean;
  policySource?: 'live' | 'snapshot' | 'none';
  message?: string | null;
}

export function getCancelEstimate(bookingId: string) {
  return apiRequest<CancelEstimateResponse>(`/hotels/bookings/${bookingId}/cancel-estimate`, {
    method: "GET",
    auth: true,
  });
}
