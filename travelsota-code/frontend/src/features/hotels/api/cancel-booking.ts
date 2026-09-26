import { apiRequest } from "@/lib/api/client";

export interface CancelBookingInput {
  bookingId: string;
  reason?: string;
}

export interface CancelBookingResponse {
  success: boolean;
  message?: string;
}

export function cancelBooking(input: CancelBookingInput) {
  return apiRequest<CancelBookingResponse>(`/hotels/bookings/${input.bookingId}/cancel`, {
    method: "POST",
    body: { reason: input.reason },
    auth: true,
  });
}
