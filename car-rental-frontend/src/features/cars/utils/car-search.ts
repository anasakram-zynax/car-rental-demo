import type { SearchCarsParams } from "@/features/cars/types/car.types";

const SEARCH_PARAM_KEYS = [
  "serviceType",
  "city",
  "pickupLocation",
  "dropoffLocation",
  "transmission",
  "fuelType",
  "minBaggage",
  "minPrice",
  "maxPrice",
  "search",
  "sort",
  "page",
  "limit",
] as const satisfies readonly (keyof SearchCarsParams)[];

export function normalizeCarSearchParams(
  params: SearchCarsParams = {},
): SearchCarsParams {
  const normalized: SearchCarsParams = {};

  for (const key of SEARCH_PARAM_KEYS) {
    const value = params[key];

    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;

    Object.assign(normalized, {
      [key]: typeof value === "string" ? value.trim() : value,
    });
  }

  return normalized;
}

export function serializeCarSearchParams(params: SearchCarsParams = {}) {
  const normalized = normalizeCarSearchParams(params);
  const searchParams = new URLSearchParams();

  for (const key of SEARCH_PARAM_KEYS) {
    const value = normalized[key];
    if (value !== undefined) searchParams.set(key, String(value));
  }

  return searchParams.toString();
}
