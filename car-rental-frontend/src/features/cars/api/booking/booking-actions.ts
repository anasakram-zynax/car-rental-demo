import type { CarBooking } from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";

export interface CancelBookingInput {
  reference: string;
  reason: string;
}

export function getBooking(reference: string) {
  return apiClient.get<CarBooking>(
    `/car-bookings/${encodeURIComponent(reference)}`,
  );
}

export function cancelBooking({ reference, reason }: CancelBookingInput) {
  return apiClient.patch<CarBooking>(
    `/car-bookings/${encodeURIComponent(reference)}/cancel`,
    { reason },
  );
}
