"use client";

import { useQuery } from "@tanstack/react-query";
import { getAdminCar } from "@/features/cars/api/car/get-car";

export function useAdminCar(id: string) {
  return useQuery({
    queryKey: ["admin", "cars", "detail", id],
    queryFn: () => getAdminCar(id),
    enabled: Boolean(id),
    retry: false,
  });
}
