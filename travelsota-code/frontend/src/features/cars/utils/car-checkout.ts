import type { CarResultsContext } from "./car-results-route";
import { decodeCarsPathValue } from "./car-results-route";

export function buildCarsCheckoutPath(
  id: string,
  returnTo: string,
  context: CarResultsContext,
) {
  const params = new URLSearchParams({
    returnTo,
    serviceType: context.serviceType,
    pickupLocationId: context.pickupLocationId,
    pickupAt: decodeCarsPathValue(context.pickupAt),
  });
  if (context.serviceType === "rental") {
    params.set("returnLocationId", context.returnLocationId);
    params.set("dropoffAt", decodeCarsPathValue(context.dropoffAt));
  } else {
    params.set("dropoffLocationId", context.dropoffLocationId);
  }
  return `/booking/cars/${encodeURIComponent(decodeURIComponent(id))}/details?${params.toString()}`;
}

export function resolveCarContactName(input: {
  bookingForOther: boolean;
  guest: { title: string; firstName: string; lastName: string };
  driver: { title: string; firstName: string; lastName: string };
}) {
  const person = input.bookingForOther ? input.driver : input.guest;
  return [person.title, person.firstName.trim(), person.lastName.trim()]
    .filter(Boolean)
    .join(" ");
}
