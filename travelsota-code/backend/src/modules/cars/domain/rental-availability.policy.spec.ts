import {
  CAR_RENTAL_RESERVING_STATUSES,
  calculateRentalAvailability,
  isHalfOpenRentalOverlap,
} from './rental-availability.policy';

describe('Cars rental availability policy', () => {
  it('reserves inventory only while payment is pending or booking is booked', () => {
    expect(CAR_RENTAL_RESERVING_STATUSES).toEqual([
      'pending_payment',
      'booking_in_progress',
      'booked',
    ]);
    expect(CAR_RENTAL_RESERVING_STATUSES).not.toContain('cancelled' as never);
  });

  it.each([
    [1, 0, 1, 1, true],
    [5, 2, 1, 3, true],
    [5, 3, 2, 2, true],
    [5, 3, 3, 2, false],
  ])(
    'calculates total %i reserved %i requested %i',
    (
      totalQuantity,
      reservedQuantity,
      requestedQuantity,
      availableQuantity,
      isAvailable,
    ) => {
      expect(
        calculateRentalAvailability({
          totalQuantity,
          reservedQuantity,
          requestedQuantity,
        }),
      ).toEqual({
        totalQuantity,
        reservedQuantity,
        requestedQuantity,
        availableQuantity,
        isAvailable,
      });
    },
  );

  it('uses half-open overlap boundaries', () => {
    const requestedPickup = new Date('2026-10-12T10:00:00Z');
    const requestedDropoff = new Date('2026-10-15T10:00:00Z');
    expect(
      isHalfOpenRentalOverlap(
        new Date('2026-10-10T10:00:00Z'),
        requestedPickup,
        requestedPickup,
        requestedDropoff,
      ),
    ).toBe(false);
    expect(
      isHalfOpenRentalOverlap(
        requestedDropoff,
        new Date('2026-10-16T10:00:00Z'),
        requestedPickup,
        requestedDropoff,
      ),
    ).toBe(false);
    expect(
      isHalfOpenRentalOverlap(
        new Date('2026-10-11T10:00:00Z'),
        new Date('2026-10-13T10:00:00Z'),
        requestedPickup,
        requestedDropoff,
      ),
    ).toBe(true);
  });

  it.each([
    ['2026-01-31T10:00:00Z', '2026-02-02T10:00:00Z'],
    ['2026-12-31T10:00:00Z', '2027-01-02T10:00:00Z'],
  ])('handles calendar boundaries without special cases', (pickup, dropoff) => {
    expect(
      isHalfOpenRentalOverlap(
        new Date(pickup),
        new Date(dropoff),
        new Date(pickup),
        new Date(dropoff),
      ),
    ).toBe(true);
  });
});
