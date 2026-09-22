"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { searchCars } from "@/features/cars/api/car/search-cars";
import type { SearchCarsParams } from "@/features/cars/types/car.types";

export const carQueryKeys = {
  all: ["cars"] as const,
  list: (params: SearchCarsParams) =>
    [...carQueryKeys.all, "list", params] as const,
};

export function useCars(params: SearchCarsParams = {}) {
  return useQuery({
    queryKey: carQueryKeys.list(params),
    queryFn: () => searchCars(params),
    placeholderData: keepPreviousData,
  });
}
