import type {
  CarSearchResult,
  PaginationParams,
} from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";

export async function getAdminCars(params: PaginationParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.page !== undefined) searchParams.set("page", String(params.page));
  if (params.limit !== undefined)
    searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return apiClient.get<CarSearchResult>(
    `/admin/cars${query ? `?${query}` : ""}`,
  );
}
