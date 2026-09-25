import type { CarBooking } from "@/features/cars/types/car.types";

type BookingTransferFields = Pick<
  CarBooking,
  "transferPackageId" | "transferPackage"
>;

export function isTransferBooking(booking: BookingTransferFields): boolean {
  return booking.transferPackageId !== null;
}

export function getTransferPackageRoute(
  booking: BookingTransferFields,
): string | null {
  if (!booking.transferPackage) return null;

  return `${booking.transferPackage.fromLocation} → ${booking.transferPackage.toLocation}`;
}
