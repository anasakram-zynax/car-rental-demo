import type { Car, CreateCarInput, UpdateCarInput } from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";

export function createCar(input: CreateCarInput) {
  return apiClient.post<Car>("/admin/cars", input);
}

export function updateCar(id: string, input: UpdateCarInput) {
  return apiClient.patch<Car>(`/admin/cars/${encodeURIComponent(id)}`, input);
}
