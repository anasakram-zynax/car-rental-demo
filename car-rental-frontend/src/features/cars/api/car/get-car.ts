import type { Car } from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";

export function getCar(id: string) {
  return apiClient.get<Car>(`/cars/${encodeURIComponent(id)}`);
}

export function getAdminCar(id: string) {
  return apiClient.get<Car>(`/admin/cars/${encodeURIComponent(id)}`);
}
