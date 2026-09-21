import { Injectable } from '@nestjs/common';
import {
  CarRepositoryPort,
  CreateCarData,
  SearchCarsFilters,
  SearchCarsResult,
  UpdateCarData,
} from '../../application/ports/car-repository.port.js';
import { PrismaService } from '../../../../../shared/database/prisma.service.js';
import { Car } from '../../domain/car.entity.js';
import { CarMapper } from './car.mapper.js';

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

        images: {
          create: data.images,
        },
      },

      include: {
        images: true,
      },
    });

    return CarMapper.toDomain(car);
  }

  async findById(id: string): Promise<Car | null> {
    const car = await this.prisma.car.findUnique({
      where: { id },

      include: {
        images: true,
      },
    });

    if (!car) {
      return null;
    }

    return CarMapper.toDomain(car);
  }

  async update(id: string, data: UpdateCarData): Promise<Car> {
    const { images, ...carData } = data;

    const car = await this.prisma.car.update({
      where: { id },

      data: {
        ...carData,

        ...(images && {
          images: {
            deleteMany: {},
            create: images,
          },
        }),
      },

      include: {
        images: true,
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
      },
    });

    return CarMapper.toDomain(car);
  }

  async search(filters: SearchCarsFilters): Promise<SearchCarsResult> {
    const { city, carTypeId, minPrice, maxPrice, page, limit } = filters;

    const skip = (page - 1) * limit;

    const where = {
      status: 'ACTIVE' as const,

      ...(city && {
        city: {
          contains: city,
          mode: 'insensitive' as const,
        },
      }),

      ...(carTypeId && {
        carTypeId,
      }),

      ...((minPrice !== undefined || maxPrice !== undefined) && {
        dailyPrice: {
          ...(minPrice !== undefined && {
            gte: minPrice,
          }),

          ...(maxPrice !== undefined && {
            lte: maxPrice,
          }),
        },
      }),
    };

    const [cars, total] = await Promise.all([
      this.prisma.car.findMany({
        where,

        include: {
          images: true,
        },

        skip,
        take: limit,

        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.car.count({
        where,
      }),
    ]);

    return {
      cars: cars.map((car) => CarMapper.toDomain(car)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
      },
    });

    if (!car) {
      return null;
    }

    return CarMapper.toDomain(car);
  }
}
