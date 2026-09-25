import type {
  CarBooking,
  PaymentStatus,
} from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";

export function getAdminBookings() {
  return apiClient.get<CarBooking[]>("/admin/car-bookings");
}

export function getAdminBooking(reference: string) {
  return apiClient.get<CarBooking>(
    `/admin/car-bookings/${encodeURIComponent(reference)}`,
  );
}

export function updateAdminBookingPaymentStatus(
  reference: string,
  paymentStatus: Extract<PaymentStatus, "paid" | "refunded">,
) {
  return apiClient.patch<CarBooking>(
    `/admin/car-bookings/${encodeURIComponent(reference)}/payment-status`,
    { paymentStatus },
  );
}
