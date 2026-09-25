import { describe, expect, it } from 'vitest';
import { InMemoryCarRepository } from '../../infrastructure/persistance/in-memory-car.repository.js';
import { ServiceType } from '../../domain/service-type.js';
import { SearchCarsUseCase } from './search-cars.use-case.js';

function carInput(
  slug: string,
  overrides: Partial<Parameters<InMemoryCarRepository['create']>[0]> = {},
) {
  return {
    name: `Demo ${slug}`,
    slug,
    brand: 'Toyota',
    model: slug,
    year: 2026,
    carTypeId: 'type-1',
    transmission: 'Automatic',
    fuelType: 'Petrol',
    doors: 4,
    passengers: 5,
    baggage: 2,
    amenities: ['Bluetooth'],
    city: 'Lahore',
    dailyPrice: 50,
    currency: 'USD',
    isRefundable: true,
    featured: false,
    images: [{ url: `https://example.com/${slug}.jpg`, isDefault: true }],
    ...overrides,
  };
}

describe('SearchCarsUseCase', () => {
  it('preserves unfiltered pagination and excludes inactive cars', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(carInput('active'));
    const inactive = await repository.create(carInput('inactive'));
    await repository.setInactive(inactive.id);
    const useCase = new SearchCarsUseCase(repository);

    await expect(
      useCase.execute({ page: 1, limit: 10 }),
    ).resolves.toMatchObject({
      total: 1,
      page: 1,
      limit: 10,
      cars: [expect.objectContaining({ slug: 'active' })],
    });
  });

  it('combines rental location, text, transmission, fuel, baggage and daily-price filters', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(
      carInput('corolla', {
        name: 'Toyota Corolla',
        model: 'Corolla',
        city: 'Lahore',
        baggage: 3,
        dailyPrice: 60,
      }),
    );
    await repository.create(
      carInput('civic', { name: 'Honda Civic', city: 'Karachi' }),
    );
    const useCase = new SearchCarsUseCase(repository);

    const result = await useCase.execute({
      serviceType: ServiceType.RENTAL,
      pickupLocation: '  lahore ',
      transmission: 'automatic',
      fuelType: 'petrol',
      minBaggage: 3,
      minPrice: 55,
      maxPrice: 65,
      search: 'COROLLA',
      page: 1,
      limit: 10,
    });

    expect(result.cars.map((car) => car.slug)).toEqual(['corolla']);
  });

  it('returns only transfer packages matching a pickup route', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(
      carInput('transfer', {
        serviceType: ServiceType.TRANSFER,
        withDriver: true,
        transferPackages: [
          {
            fromLocation: 'Airport',
            toLocation: 'Gulberg',
            price: 20,
            currency: 'USD',
          },
          {
            fromLocation: 'Railway Station',
            toLocation: 'DHA',
            price: 30,
            currency: 'USD',
          },
        ],
      }),
    );
    const useCase = new SearchCarsUseCase(repository);

    const result = await useCase.execute({
      serviceType: ServiceType.TRANSFER,
      pickupLocation: ' airport ',
      page: 1,
      limit: 10,
    });

    expect(result.cars).toHaveLength(1);
    expect(result.cars[0]?.transferPackages).toHaveLength(1);
    expect(result.cars[0]?.transferPackages[0]?.toLocation).toBe('Gulberg');
  });

  it('requires route and price to match the same transfer package', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(
      carInput('route-price', {
        serviceType: ServiceType.TRANSFER,
        withDriver: true,
        transferPackages: [
          {
            fromLocation: 'Airport',
            toLocation: 'Gulberg',
            price: 20,
            currency: 'USD',
          },
          {
            fromLocation: 'Airport',
            toLocation: 'DHA',
            price: 50,
            currency: 'USD',
          },
        ],
      }),
    );
    const useCase = new SearchCarsUseCase(repository);

    const result = await useCase.execute({
      serviceType: ServiceType.TRANSFER,
      pickupLocation: 'Airport',
      dropoffLocation: 'DHA',
      maxPrice: 30,
      page: 1,
      limit: 10,
    });

    expect(result).toMatchObject({ cars: [], total: 0 });
  });

  it('sorts transfer route results by matching package price before pagination', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(
      carInput('expensive', {
        serviceType: ServiceType.TRANSFER,
        transferPackages: [
          {
            fromLocation: 'Airport',
            toLocation: 'DHA',
            price: 70,
            currency: 'USD',
          },
        ],
      }),
    );
    await repository.create(
      carInput('affordable', {
        serviceType: ServiceType.TRANSFER,
        transferPackages: [
          {
            fromLocation: 'Airport',
            toLocation: 'DHA',
            price: 35,
            currency: 'USD',
          },
        ],
      }),
    );
    const useCase = new SearchCarsUseCase(repository);

    const result = await useCase.execute({
      serviceType: ServiceType.TRANSFER,
      pickupLocation: 'Airport',
      dropoffLocation: 'DHA',
      sort: 'price_asc',
      page: 1,
      limit: 1,
    });

    expect(result).toMatchObject({ total: 2, totalPages: 2 });
    expect(result.cars[0]?.slug).toBe('affordable');
    expect(result.cars[0]?.transferPackages[0]?.price).toBe(35);
  });

  it('applies catalog filters before pagination', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(carInput('petrol-one'));
    await repository.create(carInput('petrol-two'));
    await repository.create(carInput('hybrid-one', { fuelType: 'Hybrid' }));
    await repository.create(carInput('hybrid-two', { fuelType: 'Hybrid' }));
    const useCase = new SearchCarsUseCase(repository);

    const result = await useCase.execute({
      serviceType: ServiceType.RENTAL,
      fuelType: 'Hybrid',
      page: 2,
      limit: 1,
    });

    expect(result).toMatchObject({ total: 2, page: 2, totalPages: 2 });
    expect(result.cars).toHaveLength(1);
    expect(result.cars[0]?.fuelType).toBe('Hybrid');
  });

  it('supports name sorting and normal empty results', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(carInput('zulu', { name: 'Zulu Car' }));
    await repository.create(carInput('alpha', { name: 'Alpha Car' }));
    const useCase = new SearchCarsUseCase(repository);

    const sorted = await useCase.execute({
      sort: 'name_asc',
      page: 1,
      limit: 10,
    });
    const empty = await useCase.execute({
      search: 'does-not-exist',
      page: 1,
      limit: 10,
    });

    expect(sorted.cars.map((car) => car.slug)).toEqual(['alpha', 'zulu']);
    expect(empty).toMatchObject({ cars: [], total: 0, totalPages: 0 });
  });

  it('rejects an inverted price range before querying the repository', () => {
    const useCase = new SearchCarsUseCase(new InMemoryCarRepository());

    expect(() =>
      useCase.execute({ minPrice: 100, maxPrice: 50, page: 1, limit: 10 }),
    ).toThrow('minPrice must not be greater than maxPrice.');
  });
});
