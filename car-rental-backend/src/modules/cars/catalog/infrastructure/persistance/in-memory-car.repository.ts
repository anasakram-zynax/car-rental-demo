import type {
  CarRepositoryPort,
  CarFilterOptions,
  CarFormOptions,
  CreateCarData,
  SearchCarsFilters,
  SearchCarsResult,
  PaginationFilters,
  UpdateCarData,
} from '../../application/ports/car-repository.port.js';

import type { Car } from '../../domain/car.entity.js';
import { CarStatus } from '../../domain/car-status.js';
import { ServiceType } from '../../domain/service-type.js';

function includesText(value: string, query: string): boolean {
  const normalize = (text: string) =>
    text.trim().replace(/\s+/g, ' ').toLowerCase();

  return normalize(value).includes(normalize(query));
}

function matchesPackage(
  transferPackage: Car['transferPackages'][number],
  filters: SearchCarsFilters,
): boolean {
  return (
    (!filters.pickupLocation ||
      includesText(transferPackage.fromLocation, filters.pickupLocation)) &&
    (!filters.dropoffLocation ||
      includesText(transferPackage.toLocation, filters.dropoffLocation)) &&
    (filters.minPrice === undefined ||
      transferPackage.price >= filters.minPrice) &&
    (filters.maxPrice === undefined ||
      transferPackage.price <= filters.maxPrice)
  );
}

function resultPrice(car: Car): number {
  return car.serviceType === ServiceType.TRANSFER
    ? Math.min(...car.transferPackages.map((item) => item.price))
    : car.dailyPrice;
}

function distinctNormalized(values: string[], limit?: number) {
  const unique = new Map<string, string>();

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    const key = normalized.toLowerCase();
    if (normalized && !unique.has(key)) unique.set(key, normalized);
  }

  return [...unique.values()]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit);
}

export class InMemoryCarRepository implements CarRepositoryPort {
  public cars: Car[] = [];
  public carTypes: CarFormOptions['carTypes'] = [];

  async create(data: CreateCarData): Promise<Car> {
    const now = new Date();

    const car: Car = {
      id: crypto.randomUUID(),
      ...data,

      status: CarStatus.ACTIVE,

      serviceType: data.serviceType ?? ServiceType.RENTAL,
      withDriver: data.withDriver ?? false,
      availableQuantity: data.availableQuantity ?? 1,

      images: data.images.map((image) => ({
        id: crypto.randomUUID(),
        ...image,
      })),

      transferPackages: (data.transferPackages ?? []).map(
        (transferPackage) => ({
          id: crypto.randomUUID(),
          ...transferPackage,
        }),
      ),

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

      transferPackages: data.transferPackages
        ? data.transferPackages.map((transferPackage) => ({
            id: crypto.randomUUID(),
            ...transferPackage,
          }))
        : existing.transferPackages,

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

    if (filters.search) {
      results = results.filter((car) =>
        [car.name, car.model, car.brand].some((value) =>
          includesText(value, filters.search!),
        ),
      );
    }
    if (filters.transmission) {
      results = results.filter((car) =>
        includesText(car.transmission, filters.transmission!),
      );
    }
    if (filters.fuelType) {
      results = results.filter((car) =>
        includesText(car.fuelType, filters.fuelType!),
      );
    }
    if (filters.minBaggage !== undefined) {
      results = results.filter((car) => car.baggage >= filters.minBaggage!);
    }

    results = results.filter((car) => {
      if (filters.serviceType && car.serviceType !== filters.serviceType) {
        return false;
      }

      if (car.serviceType === ServiceType.RENTAL) {
        if (filters.dropoffLocation && !filters.serviceType) return false;
        const location = filters.pickupLocation || filters.city;
        return (
          (!location || includesText(car.city, location)) &&
          (filters.minPrice === undefined ||
            car.dailyPrice >= filters.minPrice) &&
          (filters.maxPrice === undefined || car.dailyPrice <= filters.maxPrice)
        );
      }

      return (
        (!filters.city || includesText(car.city, filters.city)) &&
        car.transferPackages.some((item) => matchesPackage(item, filters))
      );
    });

    const hasPackageFilters = Boolean(
      filters.pickupLocation ||
      filters.dropoffLocation ||
      filters.minPrice !== undefined ||
      filters.maxPrice !== undefined,
    );
    results = results.map((car) =>
      car.serviceType === ServiceType.TRANSFER && hasPackageFilters
        ? {
            ...car,
            transferPackages: car.transferPackages.filter((item) =>
              matchesPackage(item, filters),
            ),
          }
        : car,
    );

    results.sort((first, second) => {
      if (filters.sort === 'name_asc') {
        return (
          first.name.localeCompare(second.name) ||
          first.id.localeCompare(second.id)
        );
      }
      if (filters.sort === 'price_asc' || filters.sort === 'price_desc') {
        const difference = resultPrice(first) - resultPrice(second);
        return (
          (filters.sort === 'price_desc' ? -difference : difference) ||
          first.id.localeCompare(second.id)
        );
      }
      return (
        second.createdAt.getTime() - first.createdAt.getTime() ||
        first.id.localeCompare(second.id)
      );
    });

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

  async getFilterOptions(serviceType?: ServiceType): Promise<CarFilterOptions> {
    const cars = this.cars.filter(
      (car) =>
        car.status === CarStatus.ACTIVE &&
        (!serviceType || car.serviceType === serviceType),
    );
    const prices = cars.flatMap((car) =>
      car.serviceType === ServiceType.TRANSFER
        ? car.transferPackages.map((transferPackage) => transferPackage.price)
        : [car.dailyPrice],
    );

    return {
      transmissionTypes: distinctNormalized(
        cars.map((car) => car.transmission),
      ),
      fuelTypes: distinctNormalized(cars.map((car) => car.fuelType)),
      maxBaggage: Math.max(0, ...cars.map((car) => car.baggage)),
      maxPrice: Math.max(0, ...prices),
    };
  }

  async getAdminFormOptions(): Promise<CarFormOptions> {
    return {
      carTypes: [...this.carTypes].sort((left, right) =>
        left.label.localeCompare(right.label),
      ),
      transmissions: distinctNormalized(
        this.cars.map((car) => car.transmission),
      ),
      fuelTypes: distinctNormalized(this.cars.map((car) => car.fuelType)),
    };
  }

  async findTransferPickupLocations(
    search: string | undefined,
    limit: number,
  ): Promise<string[]> {
    const locations = this.cars
      .filter(
        (car) =>
          car.status === CarStatus.ACTIVE &&
          car.serviceType === ServiceType.TRANSFER,
      )
      .flatMap((car) => car.transferPackages)
      .map((transferPackage) => transferPackage.fromLocation)
      .filter((location) => !search || includesText(location, search));

    return distinctNormalized(locations, limit);
  }

  async findTransferDropoffLocations(
    pickupLocation: string,
    search: string | undefined,
    limit: number,
  ): Promise<string[]> {
    const locations = this.cars
      .filter(
        (car) =>
          car.status === CarStatus.ACTIVE &&
          car.serviceType === ServiceType.TRANSFER,
      )
      .flatMap((car) => car.transferPackages)
      .filter(
        (transferPackage) =>
          transferPackage.fromLocation.trim().toLowerCase() ===
          pickupLocation.trim().toLowerCase(),
      )
      .map((transferPackage) => transferPackage.toLocation)
      .filter((location) => !search || includesText(location, search));

    return distinctNormalized(locations, limit);
  }
}
