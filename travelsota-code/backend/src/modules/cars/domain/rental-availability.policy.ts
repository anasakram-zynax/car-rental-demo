import type { BookingStatus } from '../../../shared/booking/booking-state-machine';

export const CAR_RENTAL_RESERVING_STATUSES = [
  'booked',
] as const satisfies readonly BookingStatus[];

export interface RentalAvailabilityValues {
  totalQuantity: number;
  reservedQuantity: number;
  requestedQuantity: number;
}

export function calculateRentalAvailability(values: RentalAvailabilityValues) {
  const availableQuantity = Math.max(
    0,
    values.totalQuantity - values.reservedQuantity,
  );
  return {
    ...values,
    availableQuantity,
    isAvailable: values.requestedQuantity <= availableQuantity,
  };
}

export function isHalfOpenRentalOverlap(
  existingPickupAt: Date,
  existingDropoffAt: Date,
  requestedPickupAt: Date,
  requestedDropoffAt: Date,
) {
  const bounds = halfOpenRentalBounds(requestedPickupAt, requestedDropoffAt);
  return (
    existingPickupAt < bounds.pickupBefore &&
    existingDropoffAt > bounds.dropoffAfter
  );
}

export function halfOpenRentalBounds(pickupAt: Date, dropoffAt: Date) {
  return { pickupBefore: dropoffAt, dropoffAfter: pickupAt };
}
