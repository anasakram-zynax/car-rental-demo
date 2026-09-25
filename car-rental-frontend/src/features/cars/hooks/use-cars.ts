"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { searchCars } from "@/features/cars/api/car/search-cars";
import type { SearchCarsParams } from "@/features/cars/types/car.types";
import { normalizeCarSearchParams } from "@/features/cars/utils/car-search";

export const carQueryKeys = {
  all: ["cars"] as const,
  list: (params: SearchCarsParams) =>
    [...carQueryKeys.all, "list", params] as const,
};

export function useCars(params: SearchCarsParams = {}) {
  const normalizedParams = normalizeCarSearchParams(params);

  return useQuery({
    queryKey: carQueryKeys.list(normalizedParams),
    queryFn: () => searchCars(normalizedParams),
    placeholderData: keepPreviousData,
  });
}
