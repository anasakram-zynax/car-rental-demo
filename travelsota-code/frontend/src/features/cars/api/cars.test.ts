import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api/client";
import { checkoutCar } from "./cars";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));

const rental = {
  serviceType: "rental" as const,
  fleetId: "fleet-1",
  pickupLocation: "Lahore Airport",
  dropoffLocation: "DHA Lahore",
  pickupAt: "2026-10-01T05:00:00.000Z",
  dropoffAt: "2026-10-03T05:00:00.000Z",
  quantity: 1,
  contactName: "Customer One",
  contactEmail: "customer@example.com",
  contactPhone: "+92 300 0000000",
  gateway: "STRIPE" as const,
  idempotencyKey: "cars-stable-key",
};

describe("Cars checkout API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts an authenticated rental checkout without changing its idempotency key", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ bookingId: "booking-1" });

    await checkoutCar(rental);

    expect(apiRequest).toHaveBeenCalledWith("/cars/bookings/checkout", {
      method: "POST",
      body: rental,
      auth: true,
    });
  });

  it("posts the selected transfer package instead of a fleet transfer price", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ bookingId: "booking-2" });
    const transfer = {
      ...rental,
      serviceType: "transfer" as const,
      fleetId: undefined,
      transferPackageId: "package-1",
      dropoffAt: undefined,
      gateway: "PAYPAL" as const,
    };

    await checkoutCar(transfer);

    expect(apiRequest).toHaveBeenCalledWith(
      "/cars/bookings/checkout",
      expect.objectContaining({ body: transfer, auth: true }),
    );
  });
});
