"use client";

import { useQueries } from "@tanstack/react-query";
import { getBooking } from "@/features/cars/api/booking/booking-actions";

export function useCarBookings(references: string[]) {
  return useQueries({
    queries: references.map((reference) => ({
      queryKey: ["car-booking", reference],
      queryFn: () => getBooking(reference),
      enabled: Boolean(reference),
    })),
  });
}
