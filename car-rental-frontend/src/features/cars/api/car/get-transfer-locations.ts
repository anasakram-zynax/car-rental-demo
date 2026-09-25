import { apiClient } from "@/lib/api-client";

function locationQuery(search?: string) {
  const query = new URLSearchParams({ limit: "10" });
  if (search?.trim()) query.set("search", search.trim());
  return query;
}

export function getTransferPickupLocations(search?: string) {
  return apiClient.get<string[]>(
    `/cars/transfer-locations/pickups?${locationQuery(search)}`,
  );
}

export function getTransferDropoffLocations(
  pickupLocation: string,
  search?: string,
) {
  const query = locationQuery(search);
  query.set("pickupLocation", pickupLocation);
  return apiClient.get<string[]>(`/cars/transfer-locations/dropoffs?${query}`);
}
