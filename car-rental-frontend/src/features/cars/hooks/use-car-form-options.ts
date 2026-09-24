"use client";

import { useQuery } from "@tanstack/react-query";
import { getCarFormOptions } from "@/features/cars/api/car/get-car-form-options";
import { carQueryKeys } from "./use-cars";

export function useCarFormOptions() {
  return useQuery({
    queryKey: [...carQueryKeys.all, "admin", "form-options"],
    queryFn: getCarFormOptions,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
