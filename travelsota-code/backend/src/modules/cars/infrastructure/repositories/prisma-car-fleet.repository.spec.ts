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
        amenities: [],
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

  it('applies luggage filtering, price sorting, and pagination metadata', async () => {
    const prisma = {
      carFleet: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(13),
      },
    };
    const repository = new PrismaCarFleetRepository(prisma as never);
    await expect(
      repository.list({
        page: 2,
        pageSize: 5,
        serviceType: 'rental',
        luggageCapacity: 3,
        sort: 'price_desc',
      }),
    ).resolves.toMatchObject({ page: 2, pageSize: 5, totalPages: 3 });
    expect(prisma.carFleet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ luggageCapacity: { gte: 3 } }),
        orderBy: [{ rentalPrice: 'desc' }, { displayOrder: 'asc' }],
        skip: 5,
        take: 5,
      }),
    );
  });
});
