import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateCarDto } from '../../api/dto/update-car.dto.js';
import { CarStatus } from '../../domain/car-status.js';
import { InMemoryCarRepository } from '../../infrastructure/persistance/in-memory-car.repository.js';
import { UpdateCarUseCase } from './update-car.use-case.js';

const carInput = {
  name: 'Test Car',
  slug: 'test-car',
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
  images: [{ url: 'https://example.com/car.jpg', isDefault: true }],
};

describe('UpdateCarUseCase status updates', () => {
  it('updates active to inactive, hides it publicly, and reactivates it', async () => {
    const repository = new InMemoryCarRepository();
    const car = await repository.create(carInput);
    const useCase = new UpdateCarUseCase(repository);

    await expect(useCase.execute(car.id, { status: CarStatus.INACTIVE })).resolves.toMatchObject({
      id: car.id,
      status: CarStatus.INACTIVE,
    });
    await expect(repository.search({ page: 1, limit: 10 })).resolves.toMatchObject({ total: 0, cars: [] });
    await expect(repository.listAll({ page: 1, limit: 10 })).resolves.toMatchObject({
      total: 1,
      cars: [{ id: car.id, status: CarStatus.INACTIVE }],
    });

    await expect(useCase.execute(car.id, { status: CarStatus.ACTIVE })).resolves.toMatchObject({
      id: car.id,
      status: CarStatus.ACTIVE,
    });
    await expect(repository.search({ page: 1, limit: 10 })).resolves.toMatchObject({
      total: 1,
      cars: [{ id: car.id, status: CarStatus.ACTIVE }],
    });
  });

  it('preserves status for unrelated partial updates', async () => {
    const repository = new InMemoryCarRepository();
    const car = await repository.create(carInput);
    const useCase = new UpdateCarUseCase(repository);

    await expect(useCase.execute(car.id, { city: 'Karachi' })).resolves.toMatchObject({
      city: 'Karachi',
      status: CarStatus.ACTIVE,
    });
  });

  it('rejects invalid API status values', async () => {
    const dto = Object.assign(new UpdateCarDto(), { status: 'deleted' });

    await expect(validate(dto)).resolves.toHaveLength(1);
  });
});
