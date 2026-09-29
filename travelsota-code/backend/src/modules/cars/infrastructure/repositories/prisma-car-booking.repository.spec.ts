import { PrismaCarBookingRepository } from './prisma-car-booking.repository';

describe('PrismaCarBookingRepository rental overlap query', () => {
  it('sums quantities for reserving rentals using half-open bounds', async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { quantity: 3 } });
    const repository = new PrismaCarBookingRepository({
      carBooking: { aggregate },
    } as never);
    const pickupAt = new Date('2026-10-12T10:00:00Z');
    const dropoffAt = new Date('2026-10-15T10:00:00Z');

    await expect(
      repository.sumOverlappingRentalQuantity({
        fleetId: 'fleet-1',
        pickupAt,
        dropoffAt,
        statuses: ['booked'],
      }),
    ).resolves.toBe(3);
    expect(aggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        serviceType: 'rental',
        status: { in: ['booked'] },
        pickupAt: { lt: dropoffAt },
        dropoffAt: { gt: pickupAt },
      }),
      _sum: { quantity: true },
    });
  });
});
