import type {
  CarRepositoryPort,
  CreateCarData,
  SearchCarsFilters,
  SearchCarsResult,
  PaginationFilters,
  UpdateCarData,
} from '../../application/ports/car-repository.port.js';

import type { Car } from '../../domain/car.entity.js';
import { CarStatus } from '../../domain/car-status.js';

export class InMemoryCarRepository implements CarRepositoryPort {
  public cars: Car[] = [];

  async create(data: CreateCarData): Promise<Car> {
    const now = new Date();

    const car: Car = {
      id: crypto.randomUUID(),
      ...data,

      status: CarStatus.ACTIVE,

      images: data.images.map((image) => ({
        id: crypto.randomUUID(),
        ...image,
      })),

      createdAt: now,
      updatedAt: now,
    };

    this.cars.push(car);

    return car;
  }

  async findById(id: string): Promise<Car | null> {
    return this.cars.find((car) => car.id === id) ?? null;
  }

  async findActiveById(id: string): Promise<Car | null> {
    return (
      this.cars.find(
        (car) => car.id === id && car.status === CarStatus.ACTIVE,
      ) ?? null
    );
  }

  async update(id: string, data: UpdateCarData): Promise<Car> {
    const index = this.cars.findIndex((car) => car.id === id);

    const existing = this.cars[index];

    if (!existing) {
      throw new Error('Car not found');
    }

    const updated: Car = {
      ...existing,
      ...data,

      images: data.images
        ? data.images.map((image) => ({
            id: crypto.randomUUID(),
            ...image,
          }))
        : existing.images,

      updatedAt: new Date(),
    };

    this.cars[index] = updated;

    return updated;
  }

  async setInactive(id: string): Promise<Car> {
    const car = await this.findById(id);

    if (!car) {
      throw new Error('Car not found');
    }

    car.status = CarStatus.INACTIVE;
    car.updatedAt = new Date();

    return car;
  }

  async search(filters: SearchCarsFilters): Promise<SearchCarsResult> {
    let results = this.cars.filter((car) => car.status === CarStatus.ACTIVE);

    if (filters.city) {
      results = results.filter((car) =>
        car.city.toLowerCase().includes(filters.city!.toLowerCase()),
      );
    }

    if (filters.carTypeId) {
      results = results.filter((car) => car.carTypeId === filters.carTypeId);
    }

    if (filters.minPrice !== undefined) {
      results = results.filter((car) => car.dailyPrice >= filters.minPrice!);
    }

    if (filters.maxPrice !== undefined) {
      results = results.filter((car) => car.dailyPrice <= filters.maxPrice!);
    }

    const total = results.length;

    const start = (filters.page - 1) * filters.limit;

    const cars = results.slice(start, start + filters.limit);

    return {
      cars,
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(total / filters.limit),
    };
  }

  async listAll(filters: PaginationFilters): Promise<SearchCarsResult> {
    const total = this.cars.length;
    const start = (filters.page - 1) * filters.limit;

    return {
      cars: this.cars.slice(start, start + filters.limit),
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(total / filters.limit),
    };
  }
}
