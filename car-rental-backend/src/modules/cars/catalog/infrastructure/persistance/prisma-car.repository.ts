import { Injectable } from '@nestjs/common';
import {
  CarRepositoryPort,
  CreateCarData,
  SearchCarsFilters,
  SearchCarsResult,
  PaginationFilters,
  UpdateCarData,
} from '../../application/ports/car-repository.port.js';
import { PrismaService } from '../../../../../shared/database/prisma.service.js';
import { Car } from '../../domain/car.entity.js';
import { CarMapper } from './car.mapper.js';
import { CarStatus } from '../../domain/car-status.js';
import { ServiceType } from '../../domain/service-type.js';
import type { Prisma } from '../../../../../shared/database/generated/prisma/client.js';

function textFilter(value: string): Prisma.StringFilter {
  return { contains: value.trim().replace(/\s+/g, ' '), mode: 'insensitive' };
}

function resultPrice(car: Car): number {
  if (car.serviceType === ServiceType.TRANSFER) {
    return Math.min(
      ...car.transferPackages.map((transferPackage) => transferPackage.price),
    );
  }

  return car.dailyPrice;
}

@Injectable()
export class PrismaCarRepository implements CarRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async create(data: CreateCarData): Promise<Car> {
    const car = await this.prisma.car.create({
      data: {
        name: data.name,
        slug: data.slug,
        brand: data.brand,
        model: data.model,
        year: data.year,

        carTypeId: data.carTypeId,

        transmission: data.transmission,
        fuelType: data.fuelType,

        doors: data.doors,
        passengers: data.passengers,
        baggage: data.baggage,

        amenities: data.amenities,

        city: data.city,

        dailyPrice: data.dailyPrice,
        currency: data.currency,

        isRefundable: data.isRefundable,
        featured: data.featured,

        serviceType:
          data.serviceType === ServiceType.TRANSFER ? 'TRANSFER' : 'RENTAL',
        withDriver: data.withDriver ?? false,
        availableQuantity: data.availableQuantity ?? 1,

        images: {
          create: data.images,
        },

        transferPackages: {
          create: data.transferPackages ?? [],
        },
      },

      include: {
        images: true,
        transferPackages: true,
      },
    });

    return CarMapper.toDomain(car);
  }

  async findById(id: string): Promise<Car | null> {
    const car = await this.prisma.car.findUnique({
      where: { id },

      include: {
        images: true,
        transferPackages: true,
      },
    });

    if (!car) {
      return null;
    }

    return CarMapper.toDomain(car);
  }

  async update(id: string, data: UpdateCarData): Promise<Car> {
    const { images, status, serviceType, transferPackages, ...carData } = data;

    const car = await this.prisma.car.update({
      where: { id },

      data: {
        ...carData,

        ...(status && {
          status: status === CarStatus.ACTIVE ? 'ACTIVE' : 'INACTIVE',
        }),

        ...(serviceType && {
          serviceType:
            serviceType === ServiceType.TRANSFER ? 'TRANSFER' : 'RENTAL',
        }),

        ...(images && {
          images: {
            deleteMany: {},
            create: images,
          },
        }),

        ...(transferPackages && {
          transferPackages: {
            deleteMany: {},
            create: transferPackages,
          },
        }),
      },

      include: {
        images: true,
        transferPackages: true,
      },
    });

    return CarMapper.toDomain(car);
  }

  async setInactive(id: string): Promise<Car> {
    const car = await this.prisma.car.update({
      where: { id },

      data: {
        status: 'INACTIVE',
      },

      include: {
        images: true,
        transferPackages: true,
      },
    });

    return CarMapper.toDomain(car);
  }

  async search(filters: SearchCarsFilters): Promise<SearchCarsResult> {
    const {
      serviceType,
      city,
      pickupLocation,
      dropoffLocation,
      transmission,
      fuelType,
      minBaggage,
      minPrice,
      maxPrice,
      search,
      sort,
      page,
      limit,
    } = filters;

    const priceFilter: Prisma.DecimalFilter = {
      ...(minPrice !== undefined && { gte: minPrice }),
      ...(maxPrice !== undefined && { lte: maxPrice }),
    };
    const packageWhere: Prisma.CarTransferPackageWhereInput = {
      ...(pickupLocation && { fromLocation: textFilter(pickupLocation) }),
      ...(dropoffLocation && { toLocation: textFilter(dropoffLocation) }),
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        price: priceFilter,
      }),
    };
    const hasPackageFilters = Boolean(
      pickupLocation ||
      dropoffLocation ||
      minPrice !== undefined ||
      maxPrice !== undefined,
    );
    const and: Prisma.CarWhereInput[] = [];

    if (search?.trim()) {
      and.push({
        OR: ['name', 'model', 'brand'].map((field) => ({
          [field]: textFilter(search),
        })),
      });
    }
    if (transmission?.trim()) {
      and.push({ transmission: textFilter(transmission) });
    }
    if (fuelType?.trim()) {
      and.push({ fuelType: textFilter(fuelType) });
    }
    if (minBaggage !== undefined) {
      and.push({ baggage: { gte: minBaggage } });
    }

    if (serviceType === ServiceType.RENTAL) {
      and.push({ serviceType: 'RENTAL' });
      const rentalLocation = pickupLocation || city;
      if (rentalLocation?.trim()) {
        and.push({ city: textFilter(rentalLocation) });
      }
      if (minPrice !== undefined || maxPrice !== undefined) {
        and.push({ dailyPrice: priceFilter });
      }
    } else if (serviceType === ServiceType.TRANSFER) {
      and.push({ serviceType: 'TRANSFER' });
      if (city?.trim()) {
        and.push({ city: textFilter(city) });
      }
      if (hasPackageFilters) {
        and.push({ transferPackages: { some: packageWhere } });
      }
    } else {
      if (city?.trim()) {
        and.push({ city: textFilter(city) });
      }
      if (hasPackageFilters) {
        const branches: Prisma.CarWhereInput[] = [
          {
            serviceType: 'TRANSFER',
            transferPackages: { some: packageWhere },
          },
        ];
        if (!dropoffLocation) {
          branches.push({
            serviceType: 'RENTAL',
            ...(pickupLocation && { city: textFilter(pickupLocation) }),
            ...((minPrice !== undefined || maxPrice !== undefined) && {
              dailyPrice: priceFilter,
            }),
          });
        }
        and.push({ OR: branches });
      }
    }

    const where: Prisma.CarWhereInput = {
      status: 'ACTIVE',
      ...(and.length > 0 && { AND: and }),
    };
    const filterReturnedPackages =
      serviceType !== ServiceType.RENTAL && hasPackageFilters;
    const records = await this.prisma.car.findMany({
      where,
      include: {
        images: true,
        transferPackages: filterReturnedPackages
          ? { where: packageWhere, orderBy: { price: 'asc' } }
          : { orderBy: { price: 'asc' } },
      },
    });
    const cars = records.map((car) => CarMapper.toDomain(car));

    cars.sort((first, second) => {
      if (sort === 'name_asc') {
        return (
          first.name.localeCompare(second.name) ||
          first.id.localeCompare(second.id)
        );
      }
      if (sort === 'price_asc' || sort === 'price_desc') {
        const difference = resultPrice(first) - resultPrice(second);
        return (
          (sort === 'price_desc' ? -difference : difference) ||
          first.id.localeCompare(second.id)
        );
      }
      return (
        second.createdAt.getTime() - first.createdAt.getTime() ||
        first.id.localeCompare(second.id)
      );
    });

    const total = cars.length;
    const skip = (page - 1) * limit;
    const paginatedCars = cars.slice(skip, skip + limit);

    return {
      cars: paginatedCars,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async listAll(filters: PaginationFilters): Promise<SearchCarsResult> {
    const skip = (filters.page - 1) * filters.limit;
    const [cars, total] = await Promise.all([
      this.prisma.car.findMany({
        include: { images: true, transferPackages: true },
        skip,
        take: filters.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.car.count(),
    ]);

    return {
      cars: cars.map((car) => CarMapper.toDomain(car)),
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(total / filters.limit),
    };
  }

  async findActiveById(id: string): Promise<Car | null> {
    const car = await this.prisma.car.findFirst({
      where: {
        id,
        status: 'ACTIVE',
      },

      include: {
        images: true,
        transferPackages: true,
      },
    });

    if (!car) {
      return null;
    }

    return CarMapper.toDomain(car);
  }
}
