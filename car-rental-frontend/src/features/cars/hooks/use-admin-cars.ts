"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAdminCars } from "@/features/cars/api/car/get-admin-cars";
import type { PaginationParams } from "@/features/cars/types/car.types";

export const adminCarsQueryKeys = {
  all: ["admin", "cars"] as const,
  list: (params: PaginationParams) => [...adminCarsQueryKeys.all, "list", params] as const,
};

export function useAdminCars(params: PaginationParams) {
  return useQuery({ queryKey: adminCarsQueryKeys.list(params), queryFn: () => getAdminCars(params), placeholderData: keepPreviousData });
}
