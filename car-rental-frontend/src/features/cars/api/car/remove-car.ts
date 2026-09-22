import type { Car } from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";

export function removeCar(id: string) {
  return apiClient.delete<Car>(`/admin/cars/${encodeURIComponent(id)}`);
}
