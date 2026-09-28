import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
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
    return this.prisma.carFleet.create({
      data: {
        ...data,
        images: data.images as never,
      },
    }) as unknown as Promise<CarFleetEntity>;
  }

  async update(
    id: string,
    patch: UpdateCarFleetInput,
  ): Promise<CarFleetEntity> {
    return this.prisma.carFleet.update({
      where: { id },
      data: {
        ...patch,
        images:
          patch.images === undefined ? undefined : (patch.images as never),
      },
    }) as unknown as Promise<CarFleetEntity>;
  }

  async findById(id: string): Promise<CarFleetEntity | null> {
    return this.prisma.carFleet.findUnique({
      where: { id },
    }) as unknown as Promise<CarFleetEntity | null>;
  }

  async list(criteria: CarFleetListCriteria): Promise<CarFleetListResult> {
    const page = Math.max(1, criteria.page);
    const pageSize = Math.max(1, criteria.pageSize);
    const term = criteria.search?.trim();
    const where = {
      ...(criteria.isActive === undefined
        ? {}
        : { isActive: criteria.isActive }),
      ...(criteria.category ? { category: criteria.category } : {}),
      ...(criteria.baseLocation ? { baseLocation: criteria.baseLocation } : {}),
      ...(criteria.rentalEnabled === undefined
        ? {}
        : { rentalEnabled: criteria.rentalEnabled }),
      ...(criteria.transferEnabled === undefined
        ? {}
        : { transferEnabled: criteria.transferEnabled }),
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
    }) as unknown as Promise<CarFleetEntity>;
  }
}
