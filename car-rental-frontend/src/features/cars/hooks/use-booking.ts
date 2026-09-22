"use client";

import { useQuery } from "@tanstack/react-query";
import { getBooking } from "@/features/cars/api/booking/booking-actions";

export function useBooking(reference: string) {
  return useQuery({
    queryKey: ["car-booking", reference],
    queryFn: () => getBooking(reference),
    enabled: Boolean(reference),
  });
}
