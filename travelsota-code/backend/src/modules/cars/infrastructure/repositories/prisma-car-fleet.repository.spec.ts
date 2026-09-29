import { PrismaCarFleetRepository } from './prisma-car-fleet.repository';

describe('PrismaCarFleetRepository uniqueness handling', () => {
  it('maps a concurrent database unique violation to 409 Conflict', async () => {
    const prisma = {
      carFleet: { create: jest.fn().mockRejectedValue({ code: 'P2002' }) },
    };
    const repository = new PrismaCarFleetRepository(prisma as never);

    await expect(
      repository.create({
        displayName: 'Toyota Corolla or similar',
        normalizedDisplayName: 'toyota corolla or similar',
        brand: null,
        model: null,
        category: 'economy',
        description: null,
        passengerCapacity: 5,
        luggageCapacity: null,
        transmission: 'automatic',
        quantity: 1,
        rentalEnabled: true,
        transferEnabled: false,
        rentalPrice: 35,
        currency: 'USD',
        locationId: 'location-1',
        images: null,
        isActive: true,
        displayOrder: 0,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
