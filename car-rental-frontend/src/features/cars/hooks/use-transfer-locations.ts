"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getTransferDropoffLocations,
  getTransferPickupLocations,
} from "@/features/cars/api/car/get-transfer-locations";
import { carQueryKeys } from "./use-cars";

export function useTransferPickupLocations(search: string, enabled = true) {
  return useQuery({
    queryKey: [...carQueryKeys.all, "transfer-pickups", search],
    queryFn: () => getTransferPickupLocations(search),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTransferDropoffLocations(
  pickupLocation: string,
  search: string,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      ...carQueryKeys.all,
      "transfer-dropoffs",
      pickupLocation,
      search,
    ],
    queryFn: () => getTransferDropoffLocations(pickupLocation, search),
    enabled: enabled && Boolean(pickupLocation),
    staleTime: 5 * 60 * 1000,
  });
}
