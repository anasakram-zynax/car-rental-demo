import { describe, expect, it } from 'vitest';
import { ServiceType } from '../../domain/service-type.js';
import { InMemoryCarRepository } from '../../infrastructure/persistance/in-memory-car.repository.js';
import { SearchTransferLocationsUseCase } from './search-transfer-locations.use-case.js';

function transferInput(
  slug: string,
  transferPackages: Parameters<
    InMemoryCarRepository['create']
  >[0]['transferPackages'],
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
    city: 'Islamabad',
    dailyPrice: 1,
    currency: 'USD',
    isRefundable: true,
    featured: false,
    serviceType: ServiceType.TRANSFER,
    images: [],
    transferPackages,
  };
}

describe('SearchTransferLocationsUseCase', () => {
  it('returns distinct active pickup locations with case-insensitive search', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(
      transferInput('one', [
        {
          fromLocation: 'Islamabad International Airport',
          toLocation: 'F-7',
          price: 40,
          currency: 'USD',
        },
        {
          fromLocation: 'Islamabad International Airport',
          toLocation: 'Blue Area',
          price: 35,
          currency: 'USD',
        },
      ]),
    );
    await repository.create(
      transferInput('two', [
        {
          fromLocation: 'Lahore Airport',
          toLocation: 'Gulberg',
          price: 30,
          currency: 'USD',
        },
      ]),
    );
    const inactive = await repository.create(
      transferInput('inactive', [
        {
          fromLocation: 'Islamabad Hidden Stop',
          toLocation: 'Hidden',
          price: 30,
          currency: 'USD',
        },
      ]),
    );
    await repository.setInactive(inactive.id);
    const useCase = new SearchTransferLocationsUseCase(repository);

    await expect(useCase.pickups('  ISLAM  ', 10)).resolves.toEqual([
      'Islamabad International Airport',
    ]);
  });

  it('returns only distinct drop-offs belonging to the selected pickup', async () => {
    const repository = new InMemoryCarRepository();
    await repository.create(
      transferInput('routes', [
        {
          fromLocation: 'Islamabad Airport',
          toLocation: 'F-7',
          price: 40,
          currency: 'USD',
        },
        {
          fromLocation: 'Islamabad Airport',
          toLocation: 'Blue Area',
          price: 35,
          currency: 'USD',
        },
        {
          fromLocation: 'Lahore Airport',
          toLocation: 'Gulberg',
          price: 30,
          currency: 'USD',
        },
      ]),
    );
    const useCase = new SearchTransferLocationsUseCase(repository);

    await expect(
      useCase.dropoffs('  islamabad   airport ', '', 10),
    ).resolves.toEqual(['Blue Area', 'F-7']);
    await expect(
      useCase.dropoffs('Islamabad Airport', 'f', 10),
    ).resolves.toEqual(['F-7']);
  });
});
