import type { Car, CarStatus } from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";

export function updateCarStatus(id: string, status: CarStatus) {
  return apiClient.patch<Car>(`/admin/cars/${encodeURIComponent(id)}`, { status });
}
