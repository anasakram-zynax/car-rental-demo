import { describe, expect, it } from 'vitest';
import { ServiceType } from '../../domain/service-type.js';
import { InMemoryCarRepository } from '../../infrastructure/persistance/in-memory-car.repository.js';
import { GetCarFilterOptionsUseCase } from './get-car-filter-options.use-case.js';

function carInput(
  slug: string,
  overrides: Partial<Parameters<InMemoryCarRepository['create']>[0]> = {},
) {
  return {
    name: slug,
    slug,
    brand: 'Demo',
    model: slug,
    year: 2026,
    carTypeId: 'type-1',
    transmission: 'Automatic',
    fuelType: 'Petrol',
    doors: 4,
    passengers: 5,
    baggage: 2,
    amenities: [],
    city: 'Lahore',
    dailyPrice: 50,
    currency: 'USD',
    isRefundable: true,
    featured: false,
    images: [],
    ...overrides,
  };
}

describe('GetCarFilterOptionsUseCase', () => {
  it('uses the full active service catalog independently of pagination or selected result filters', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(carInput('petrol', { baggage: 2 }));
    await repository.create(
      carInput('hybrid', {
        fuelType: 'Hybrid',
        transmission: 'Manual',
        baggage: 4,
      }),
    );
    await repository.create(carInput('diesel', { fuelType: 'Diesel' }));
    const useCase = new GetCarFilterOptionsUseCase(repository);

    const paginatedPetrol = await repository.search({
      serviceType: ServiceType.RENTAL,
      fuelType: 'Petrol',
      page: 1,
      limit: 1,
    });
    const options = await useCase.execute(ServiceType.RENTAL);

    expect(paginatedPetrol.cars).toHaveLength(1);
    expect(options.fuelTypes).toEqual(['Diesel', 'Hybrid', 'Petrol']);
    expect(options.transmissionTypes).toEqual(['Automatic', 'Manual']);
    expect(options.maxBaggage).toBe(4);
  });

  it('uses rental daily prices and rounds the maximum up to a multiple of ten', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(carInput('rental', { dailyPrice: 195 }));
    const useCase = new GetCarFilterOptionsUseCase(repository);

    await expect(useCase.execute(ServiceType.RENTAL)).resolves.toMatchObject({
      maxPrice: 200,
    });
  });

  it('uses transfer package prices and excludes inactive cars', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(
      carInput('transfer', {
        serviceType: ServiceType.TRANSFER,
        dailyPrice: 999,
        transferPackages: [
          {
            fromLocation: 'Airport',
            toLocation: 'City',
            price: 87,
            currency: 'USD',
          },
        ],
      }),
    );
    const inactive = await repository.create(
      carInput('inactive-transfer', {
        serviceType: ServiceType.TRANSFER,
        fuelType: 'Electric',
        baggage: 9,
        transferPackages: [
          {
            fromLocation: 'Hidden',
            toLocation: 'Hidden',
            price: 500,
            currency: 'USD',
          },
        ],
      }),
    );
    await repository.setInactive(inactive.id);
    const useCase = new GetCarFilterOptionsUseCase(repository);

    await expect(useCase.execute(ServiceType.TRANSFER)).resolves.toEqual({
      transmissionTypes: ['Automatic'],
      fuelTypes: ['Petrol'],
      maxBaggage: 2,
      maxPrice: 90,
    });
  });
});
