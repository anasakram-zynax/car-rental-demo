"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cancelBooking } from "@/features/cars/api/booking/booking-actions";

export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelBooking,
    retry: false,
    onSuccess: (booking) => {
      queryClient.setQueryData(["car-booking", booking.reference], booking);
    },
  });
}
