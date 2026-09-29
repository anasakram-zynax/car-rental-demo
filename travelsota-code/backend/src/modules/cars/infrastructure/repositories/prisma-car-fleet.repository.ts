import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { BusinessError } from '../../../../shared/errors/business-error';
import type {
  CarFleetListCriteria,
  CarFleetListResult,
  CarFleetRepositoryPort,
} from '../../application/ports/car-fleet-repository.port';
import type {
  CarFleetEntity,
  CreateCarFleetInput,
  UpdateCarFleetInput,
} from '../../domain/entities/car-fleet.entity';

@Injectable()
export class PrismaCarFleetRepository implements CarFleetRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCarFleetInput): Promise<CarFleetEntity> {
    try {
      return (await this.prisma.carFleet.create({
        data: {
          ...data,
          images: data.images as never,
        },
        include: { location: true },
      })) as unknown as CarFleetEntity;
    } catch (error) {
      this.rethrowDuplicate(error);
    }
  }

  async update(
    id: string,
    patch: UpdateCarFleetInput,
  ): Promise<CarFleetEntity> {
    try {
      return (await this.prisma.carFleet.update({
        where: { id },
        data: {
          ...patch,
          images:
            patch.images === undefined ? undefined : (patch.images as never),
        },
        include: { location: true },
      })) as unknown as CarFleetEntity;
    } catch (error) {
      this.rethrowDuplicate(error);
    }
  }

  async findById(id: string): Promise<CarFleetEntity | null> {
    return this.prisma.carFleet.findUnique({
      where: { id },
      include: { location: true },
    }) as unknown as Promise<CarFleetEntity | null>;
  }

  async findDuplicate(
    normalizedDisplayName: string,
    locationId: string,
    excludeId?: string,
  ): Promise<CarFleetEntity | null> {
    return this.prisma.carFleet.findFirst({
      where: {
        normalizedDisplayName,
        locationId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      include: { location: true },
    }) as unknown as Promise<CarFleetEntity | null>;
  }

  async list(criteria: CarFleetListCriteria): Promise<CarFleetListResult> {
    const page = Math.max(1, criteria.page);
    const pageSize = Math.max(1, criteria.pageSize);
    const term = criteria.search?.trim();
    const priceField = criteria.serviceType === 'rental' ? 'rentalPrice' : null;
    const priceFilter =
      priceField &&
      (criteria.minPrice !== undefined || criteria.maxPrice !== undefined)
        ? {
            [priceField]: {
              ...(criteria.minPrice === undefined
                ? {}
                : { gte: criteria.minPrice }),
              ...(criteria.maxPrice === undefined
                ? {}
                : { lte: criteria.maxPrice }),
            },
          }
        : {};
    const where = {
      ...(criteria.isActive === undefined
        ? {}
        : { isActive: criteria.isActive }),
      ...(criteria.category
        ? {
            category: {
              equals: criteria.category,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(criteria.locationId ? { locationId: criteria.locationId } : {}),
      ...(criteria.location
        ? {
            location: {
              OR: [
                {
                  label: {
                    contains: criteria.location,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  city: {
                    contains: criteria.location,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  code: {
                    equals: criteria.location,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            },
          }
        : {}),
      ...(criteria.rentalEnabled === undefined
        ? {}
        : { rentalEnabled: criteria.rentalEnabled }),
      ...(criteria.transferEnabled === undefined
        ? {}
        : { transferEnabled: criteria.transferEnabled }),
      ...(criteria.passengerCapacity === undefined
        ? {}
        : { passengerCapacity: { gte: criteria.passengerCapacity } }),
      ...(criteria.transmission
        ? {
            transmission: {
              equals: criteria.transmission,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...priceFilter,
      ...(term
        ? {
            OR: [
              { displayName: { contains: term, mode: 'insensitive' as const } },
              { brand: { contains: term, mode: 'insensitive' as const } },
              { model: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.carFleet.findMany({
        where,
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
        include: { location: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.carFleet.count({ where }),
    ]);

    return {
      items: items as unknown as CarFleetEntity[],
      total,
      page,
      pageSize,
    };
  }

  async deactivate(id: string): Promise<CarFleetEntity> {
    return this.prisma.carFleet.update({
      where: { id },
      data: { isActive: false },
      include: { location: true },
    }) as unknown as Promise<CarFleetEntity>;
  }

  private rethrowDuplicate(error: unknown): never {
    if ((error as { code?: string })?.code === 'P2002') {
      throw new BusinessError(
        'CAR_FLEET_DUPLICATE',
        'A fleet with this display name already exists at this location.',
        HttpStatus.CONFLICT,
      );
    }
    throw error;
  }
}
