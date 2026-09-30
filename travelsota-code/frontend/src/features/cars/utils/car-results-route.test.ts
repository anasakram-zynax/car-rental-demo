import { describe, expect, it } from "vitest";
import { buildCarsResultsPath, toCarsSearchQuery } from "./car-results-route";

const pickupAt = "2026-09-30T05:00:00.000Z";
const dropoffAt = "2026-10-02T05:00:00.000Z";

describe("Cars results routes", () => {
  it("does not pre-encode ISO path segments", () => {
    expect(
      buildCarsResultsPath({
        serviceType: "rental",
        pickupLocationId: "pickup",
        returnLocationId: "return",
        pickupAt,
        dropoffAt,
      }),
    ).toBe(`/cars/rental/pickup/return/${pickupAt}/${dropoffAt}`);
  });

  it("translates path dates to unencoded backend ISO values", () => {
    const query = toCarsSearchQuery(
      {
        serviceType: "rental",
        pickupLocationId: "pickup",
        returnLocationId: "return",
        pickupAt,
        dropoffAt,
      },
      new URLSearchParams(),
    );

    expect(query.pickupAt).toBe(pickupAt);
    expect(query.dropoffAt).toBe(dropoffAt);
    expect(query.pageSize).toBe(8);
  });

  it("recovers dates from previously double-encoded route state", () => {
    const query = toCarsSearchQuery(
      {
        serviceType: "transfer",
        pickupLocationId: "pickup",
        dropoffLocationId: "dropoff",
        pickupAt: "2026-09-30T05%253A00%253A00.000Z",
      },
      new URLSearchParams(),
    );

    expect(query.pickupAt).toBe(pickupAt);
  });
});
