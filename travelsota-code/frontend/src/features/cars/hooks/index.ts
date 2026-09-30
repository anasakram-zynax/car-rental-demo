"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  getCarLocationSuggestions,
  getCarLocation,
  getTransferDropoffs,
  searchCars,
  checkoutCar,
} from "../api/cars";
import type { CarCheckoutInput, CarSearchMode, CarSearchQuery } from "../types";

function useDebounced(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced.trim();
}
export function useCarLocations(mode: CarSearchMode, query: string) {
  const q = useDebounced(query);
  return useQuery({
    queryKey: ["cars", "locations", mode, q],
    queryFn: ({ signal }) => getCarLocationSuggestions(mode, q, signal),
    enabled: q.length >= 3,
    staleTime: 60_000,
  });
}
export function useCarLocation(id?: string) {
  return useQuery({
    queryKey: ["cars", "location", id],
    queryFn: ({ signal }) => getCarLocation(id!, signal),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}
export function useTransferDropoffs(pickupLocationId?: string, query = "") {
  const q = useDebounced(query);
  return useQuery({
    queryKey: ["cars", "transfer-dropoffs", pickupLocationId, q],
    queryFn: ({ signal }) => getTransferDropoffs(pickupLocationId!, q, signal),
    enabled: Boolean(pickupLocationId),
    staleTime: 60_000,
  });
}
export function useCarsSearch(query: CarSearchQuery | null) {
  return useQuery({
    queryKey: ["cars", "search", query],
    queryFn: ({ signal }) => searchCars(query!, signal),
    enabled: Boolean(query),
  });
}

export function useCarCheckout() {
  return useMutation({
    mutationFn: (input: CarCheckoutInput) => checkoutCar(input),
  });
}
