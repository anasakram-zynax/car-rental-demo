import { describe, expect, it } from 'vitest';
import { InMemoryCarRepository } from '../../infrastructure/persistance/in-memory-car.repository.js';
import { ListAdminCarsUseCase } from './list-admin-cars.use-case.js';

const carInput = (suffix: string) => ({
  name: `Test Car ${suffix}`,
  slug: `test-car-${suffix}`,
  brand: 'Test',
  model: 'Model',
  year: 2026,
  carTypeId: 'type-1',
  transmission: 'Automatic',
  fuelType: 'Petrol',
  doors: 4,
  passengers: 5,
  baggage: 2,
  amenities: ['Bluetooth'],
  city: 'Lahore',
  dailyPrice: 100,
  currency: 'USD',
  isRefundable: true,
  featured: false,
  images: [{ url: `https://example.com/${suffix}.jpg`, isDefault: true }],
});

describe('ListAdminCarsUseCase', () => {
  it('lists active and inactive cars while public search excludes inactive cars', async () => {
    const repository = new InMemoryCarRepository();
    const activeCar = await repository.create(carInput('active'));
    const inactiveCar = await repository.create(carInput('inactive'));
    await repository.setInactive(inactiveCar.id);
    const useCase = new ListAdminCarsUseCase(repository);

    const adminResult = await useCase.execute({ page: 1, limit: 10 });
    const publicResult = await repository.search({ page: 1, limit: 10 });

    expect(adminResult.total).toBe(2);
    expect(adminResult.cars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: activeCar.id, status: 'active' }),
        expect.objectContaining({
          id: inactiveCar.id,
          status: 'inactive',
          images: [expect.objectContaining({ isDefault: true })],
        }),
      ]),
    );
    expect(publicResult).toMatchObject({ total: 1, cars: [{ id: activeCar.id }] });
  });

  it('paginates and returns an empty page when its offset exceeds all cars', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(carInput('one'));
    await repository.create(carInput('two'));
    const useCase = new ListAdminCarsUseCase(repository);

    await expect(useCase.execute({ page: 1, limit: 1 })).resolves.toMatchObject({
      total: 2,
      page: 1,
      limit: 1,
      totalPages: 2,
      cars: [expect.any(Object)],
    });
    await expect(useCase.execute({ page: 3, limit: 1 })).resolves.toEqual({
      cars: [],
      total: 2,
      page: 3,
      limit: 1,
      totalPages: 2,
    });
  });
});
