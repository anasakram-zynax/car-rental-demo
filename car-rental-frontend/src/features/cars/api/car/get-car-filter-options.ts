import type {
  CarFilterOptions,
  ServiceType,
} from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";

export function getCarFilterOptions(serviceType: ServiceType) {
  const query = new URLSearchParams({ serviceType });
  return apiClient.get<CarFilterOptions>(`/cars/filter-options?${query}`);
}
