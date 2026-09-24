import type {
  CarSearchResult,
  SearchCarsParams,
} from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";
import { serializeCarSearchParams } from "@/features/cars/utils/car-search";

export async function searchCars(params: SearchCarsParams = {}) {
  const query = serializeCarSearchParams(params);

  return apiClient.get<CarSearchResult>(`/cars${query ? `?${query}` : ""}`);
}
