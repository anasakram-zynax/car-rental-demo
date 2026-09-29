import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type { CarLocationRepositoryPort } from '../../application/ports/car-location-repository.port';
import type {
  CarLocationEntity,
  CreateCarLocationInput,
} from '../../domain/entities/car-location.entity';

@Injectable()
export class PrismaCarLocationRepository implements CarLocationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<CarLocationEntity | null> {
    return this.prisma.carLocation.findUnique({
      where: { id },
    });
  }

  findByIdentity(identity: string): Promise<CarLocationEntity | null> {
    return this.prisma.carLocation.findUnique({
      where: { identity },
    });
  }

  create(data: CreateCarLocationInput): Promise<CarLocationEntity> {
    return this.prisma.carLocation.create({
      data,
    });
  }

  async findOrCreate(data: CreateCarLocationInput): Promise<CarLocationEntity> {
    const existing = await this.findByIdentity(data.identity);
    if (existing) return existing;
    try {
      return await this.create(data);
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        const concurrent = await this.findByIdentity(data.identity);
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  searchRentalLocations(
    query: string,
    limit = 10,
  ): Promise<CarLocationEntity[]> {
    return this.prisma.carLocation.findMany({
      where: {
        fleets: { some: { isActive: true, rentalEnabled: true } },
        OR: this.textSearch(query),
      },
      orderBy: { label: 'asc' },
      take: limit,
    });
  }

  searchTransferPickupLocations(
    query: string,
    limit = 10,
  ): Promise<CarLocationEntity[]> {
    return this.prisma.carLocation.findMany({
      where: {
        pickupPackages: {
          some: {
            isActive: true,
            fleet: { isActive: true, transferEnabled: true },
          },
        },
        OR: this.textSearch(query),
      },
      orderBy: { label: 'asc' },
      take: limit,
    });
  }

  private textSearch(query: string) {
    return [
      { label: { contains: query, mode: 'insensitive' as const } },
      { name: { contains: query, mode: 'insensitive' as const } },
      { city: { contains: query, mode: 'insensitive' as const } },
      { code: { equals: query, mode: 'insensitive' as const } },
    ];
  }
}
