import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type {
  CarTransferPackageRepositoryPort,
  TransferPackageSearchCriteria,
  TransferPackageSearchResult,
} from '../../application/ports/car-transfer-package-repository.port';
import type {
  CarTransferPackageEntity,
  CreateCarTransferPackageInput,
  UpdateCarTransferPackageInput,
} from '../../domain/entities/car-transfer-package.entity';
import type { CarLocationEntity } from '../../domain/entities/car-location.entity';

@Injectable()
export class PrismaCarTransferPackageRepository implements CarTransferPackageRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: CreateCarTransferPackageInput,
  ): Promise<CarTransferPackageEntity> {
    return this.prisma.carTransferPackage.create({
      data,
      include: this.detailsInclude(),
    }) as unknown as Promise<CarTransferPackageEntity>;
  }

  update(
    id: string,
    patch: UpdateCarTransferPackageInput,
  ): Promise<CarTransferPackageEntity> {
    return this.prisma.carTransferPackage.update({
      where: { id },
      data: patch,
      include: this.detailsInclude(),
    }) as unknown as Promise<CarTransferPackageEntity>;
  }

  findById(id: string): Promise<CarTransferPackageEntity | null> {
    return this.prisma.carTransferPackage.findUnique({
      where: { id },
      include: this.detailsInclude(),
    }) as unknown as Promise<CarTransferPackageEntity | null>;
  }

  async search(
    criteria: TransferPackageSearchCriteria,
  ): Promise<TransferPackageSearchResult> {
    const where = {
      pickupLocationId: criteria.pickupLocationId,
      ...(criteria.dropoffLocationId
        ? { dropoffLocationId: criteria.dropoffLocationId }
        : {}),
      isActive: true,
      price: {
        ...(criteria.minPrice === undefined ? {} : { gte: criteria.minPrice }),
        ...(criteria.maxPrice === undefined ? {} : { lte: criteria.maxPrice }),
      },
      fleet: {
        isActive: true,
        transferEnabled: true,
        ...(criteria.passengerCapacity === undefined
          ? {}
          : { passengerCapacity: { gte: criteria.passengerCapacity } }),
        ...(criteria.luggageCapacity === undefined
          ? {}
          : { luggageCapacity: { gte: criteria.luggageCapacity } }),
        ...(criteria.category
          ? {
              category: {
                equals: criteria.category,
                mode: 'insensitive' as const,
              },
            }
          : {}),
        ...(criteria.transmission
          ? {
              transmission: {
                equals: criteria.transmission,
                mode: 'insensitive' as const,
              },
            }
          : {}),
      },
    };
    const [items, total] = await Promise.all([
      this.prisma.carTransferPackage.findMany({
        where,
        include: this.detailsInclude(),
        orderBy:
          criteria.sort === 'price_desc'
            ? [{ price: 'desc' }, { createdAt: 'desc' }]
            : [{ price: 'asc' }, { createdAt: 'desc' }],
        skip: (criteria.page - 1) * criteria.pageSize,
        take: criteria.pageSize,
      }),
      this.prisma.carTransferPackage.count({ where }),
    ]);
    return {
      items: items as unknown as CarTransferPackageEntity[],
      total,
      page: criteria.page,
      pageSize: criteria.pageSize,
      totalPages: Math.ceil(total / criteria.pageSize),
    };
  }

  async findDropoffLocations(
    pickupLocationId: string,
    query?: string,
    limit = 20,
  ): Promise<CarLocationEntity[]> {
    const packages = await this.prisma.carTransferPackage.findMany({
      where: {
        pickupLocationId,
        isActive: true,
        fleet: { isActive: true, transferEnabled: true },
        ...(query
          ? {
              dropoffLocation: {
                OR: [
                  { label: { contains: query, mode: 'insensitive' as const } },
                  { city: { contains: query, mode: 'insensitive' as const } },
                  { code: { equals: query, mode: 'insensitive' as const } },
                ],
              },
            }
          : {}),
      },
      distinct: ['dropoffLocationId'],
      include: { dropoffLocation: true },
      orderBy: { dropoffLocation: { label: 'asc' } },
      take: limit,
    });
    return packages.map((item) => item.dropoffLocation);
  }

  private detailsInclude() {
    return {
      fleet: { include: { location: true } },
      pickupLocation: true,
      dropoffLocation: true,
    } as const;
  }
}
