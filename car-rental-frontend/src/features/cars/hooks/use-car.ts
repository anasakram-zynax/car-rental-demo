"use client";

import { useQuery } from "@tanstack/react-query";
import { getCar } from "@/features/cars/api/car/get-car";

export function useCar(id: string) {
  return useQuery({
    queryKey: ["cars", "detail", id],
    queryFn: () => getCar(id),
    enabled: Boolean(id),
  });
}
