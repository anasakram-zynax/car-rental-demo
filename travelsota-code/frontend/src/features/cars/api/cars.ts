import { apiRequest } from "@/lib/api/client";
import type {
  CarLocation,
  CarSearchMode,
  CarSearchQuery,
  CarSearchResponse,
  CarCheckoutInput,
  CarCheckoutResponse,
} from "../types";

function queryString(values: object) {
  const params = new URLSearchParams();
  Object.entries(values as Record<string, string | number | undefined>).forEach(
    ([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    },
  );
  return params.toString();
}

export function getCarLocationSuggestions(
  serviceType: CarSearchMode,
  q: string,
  signal?: AbortSignal,
) {
  return apiRequest<CarLocation[]>(
    `/cars/locations/suggestions?${queryString({ serviceType, q, limit: 10 })}`,
    { signal },
  );
}
export function getCarLocation(id: string, signal?: AbortSignal) {
  return apiRequest<CarLocation>(`/cars/locations/${encodeURIComponent(id)}`, {
    signal,
  });
}
export function getTransferDropoffs(
  pickupLocationId: string,
  q: string,
  signal?: AbortSignal,
) {
  return apiRequest<CarLocation[]>(
    `/cars/transfers/dropoffs?${queryString({ pickupLocationId, q })}`,
    { signal },
  );
}
export function searchCars(query: CarSearchQuery, signal?: AbortSignal) {
  const sanitizedQuery: CarSearchQuery = {
    ...query,
    minPrice:
      query.minPrice !== undefined && query.minPrice >= 0
        ? query.minPrice
        : undefined,
    maxPrice:
      query.maxPrice !== undefined && query.maxPrice >= 0
        ? query.maxPrice
        : undefined,
    passengerCapacity:
      query.passengerCapacity !== undefined && query.passengerCapacity >= 1
        ? query.passengerCapacity
        : undefined,
    luggageCapacity:
      query.luggageCapacity !== undefined && query.luggageCapacity >= 1
        ? query.luggageCapacity
        : undefined,
  };
  return apiRequest<CarSearchResponse>(
    `/cars/search?${queryString(sanitizedQuery)}`,
    { signal },
  );
}

export function checkoutCar(input: CarCheckoutInput) {
  return apiRequest<CarCheckoutResponse>("/cars/bookings/checkout", {
    method: "POST",
    body: input,
    auth: true,
  });
}
