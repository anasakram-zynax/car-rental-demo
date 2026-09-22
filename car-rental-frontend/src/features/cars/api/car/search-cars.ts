import type {
  CarSearchResult,
  SearchCarsParams,
} from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";

export async function searchCars(params: SearchCarsParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.city) searchParams.set("city", params.city);
  if (params.carTypeId) searchParams.set("carTypeId", params.carTypeId);
  if (params.minPrice !== undefined) {
    searchParams.set("minPrice", String(params.minPrice));
  }
  if (params.maxPrice !== undefined) {
    searchParams.set("maxPrice", String(params.maxPrice));
  }
  if (params.page !== undefined) searchParams.set("page", String(params.page));
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();

  return apiClient.get<CarSearchResult>(`/cars${query ? `?${query}` : ""}`);
}
