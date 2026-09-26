import { apiRequest } from "@/lib/api/client";
import type { HotelBookingDetailResponse } from "./get-booking";

export interface RetrieveBookingInput {
  reference: string;
  provider: string;
}

export function retrieveBooking(input: RetrieveBookingInput) {
  return apiRequest<HotelBookingDetailResponse>(
    `/hotels/bookings/${encodeURIComponent(input.reference)}/by-reference?provider=${encodeURIComponent(input.provider)}`,
    { method: "GET" },
  );
}
