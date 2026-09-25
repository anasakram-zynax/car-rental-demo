"use client";

import { useQuery } from "@tanstack/react-query";
import { getCarFilterOptions } from "@/features/cars/api/car/get-car-filter-options";
import type { ServiceType } from "@/features/cars/types/car.types";
import { carQueryKeys } from "./use-cars";

export function useCarFilterOptions(serviceType: ServiceType) {
  return useQuery({
    queryKey: [...carQueryKeys.all, "filter-options", serviceType],
    queryFn: () => getCarFilterOptions(serviceType),
    staleTime: 5 * 60 * 1000,
  });
}
