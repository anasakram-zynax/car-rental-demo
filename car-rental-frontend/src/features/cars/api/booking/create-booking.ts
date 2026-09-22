import type {
  CarBooking,
  CreateCarBookingInput,
} from "@/features/cars/types/car.types";
import { apiClient } from "@/lib/api-client";

export function createBooking(input: CreateCarBookingInput) {
  return apiClient.post<CarBooking>("/car-bookings", input);
}
