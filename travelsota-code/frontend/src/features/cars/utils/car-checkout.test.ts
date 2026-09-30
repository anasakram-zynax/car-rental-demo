import { describe, expect, it } from "vitest";
import { buildCarsCheckoutPath, resolveCarContactName } from "./car-checkout";

describe("Cars checkout flow", () => {
  it("navigates directly to the booking route with journey and return context", () => {
    const path = buildCarsCheckoutPath(
      "fleet-1",
      "/cars/rental/context/car/fleet-1",
      {
        serviceType: "rental",
        pickupLocationId: "pickup-1",
        returnLocationId: "return-1",
        pickupAt: "2026-10-02T10:00:00.000Z",
        dropoffAt: "2026-10-04T10:00:00.000Z",
      },
    );
    expect(path).toContain("/booking/cars/fleet-1/details?");
    expect(path).toContain("returnLocationId=return-1");
    expect(path).not.toContain("step=review");
  });

  it("syncs the primary driver until booking-for-other is enabled", () => {
    const common = {
      guest: { title: "Mr", firstName: "Demo", lastName: "User" },
      driver: { title: "Ms", firstName: "Other", lastName: "Driver" },
    };
    expect(resolveCarContactName({ ...common, bookingForOther: false })).toBe(
      "Mr Demo User",
    );
    expect(resolveCarContactName({ ...common, bookingForOther: true })).toBe(
      "Ms Other Driver",
    );
  });
});
