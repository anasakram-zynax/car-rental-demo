import type { CarImage } from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";

export function uploadCarImages(carId: string, files: File[]) {
  const body = new FormData();
  files.forEach((file) => body.append("images", file));
  return apiClient.post<CarImage[]>(
    `/admin/cars/${encodeURIComponent(carId)}/images`,
    body,
  );
}

export function deleteCarImage(carId: string, imageId: string) {
  return apiClient.delete<{ id: string }>(
    `/admin/cars/${encodeURIComponent(carId)}/images/${encodeURIComponent(imageId)}`,
  );
}

export function setDefaultCarImage(carId: string, imageId: string) {
  return apiClient.patch<{ id: string }>(
    `/admin/cars/${encodeURIComponent(carId)}/images/${encodeURIComponent(imageId)}/default`,
  );
}
