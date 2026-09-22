"use client";

import { useMutation } from "@tanstack/react-query";
import { createBooking } from "@/features/cars/api/booking/create-booking";

export function useCreateBooking() {
  return useMutation({
    mutationFn: createBooking,
    retry: false,
  });
}
