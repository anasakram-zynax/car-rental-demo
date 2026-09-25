"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminBooking,
  getAdminBookings,
  updateAdminBookingPaymentStatus,
} from "@/features/cars/api/booking/admin-bookings";
import type { PaymentStatus } from "@/features/cars/types/car.types";

export const adminBookingQueryKeys = {
  all: ["admin", "car-bookings"] as const,
  detail: (reference: string) =>
    [...adminBookingQueryKeys.all, "detail", reference] as const,
};

export function useAdminBookings() {
  return useQuery({
    queryKey: adminBookingQueryKeys.all,
    queryFn: getAdminBookings,
    retry: false,
  });
}

export function useAdminBooking(reference: string) {
  return useQuery({
    queryKey: adminBookingQueryKeys.detail(reference),
    queryFn: () => getAdminBooking(reference),
    enabled: Boolean(reference),
    retry: false,
  });
}

export function useUpdateAdminBookingPaymentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      reference,
      paymentStatus,
    }: {
      reference: string;
      paymentStatus: Extract<PaymentStatus, "paid" | "refunded">;
    }) => updateAdminBookingPaymentStatus(reference, paymentStatus),
    retry: false,
    onSuccess: (booking) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: adminBookingQueryKeys.all }),
        queryClient.invalidateQueries({
          queryKey: adminBookingQueryKeys.detail(booking.reference),
        }),
      ]),
  });
}
