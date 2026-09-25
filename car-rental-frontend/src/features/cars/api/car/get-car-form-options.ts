import type { CarFormOptions } from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";

export function getCarFormOptions() {
  return apiClient.get<CarFormOptions>("/admin/cars/form-options");
}
