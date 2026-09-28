import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type {
  CarBookingPageCriteria,
  CarBookingPageResult,
  CarBookingRepositoryPort,
  OverlappingRentalCriteria,
} from '../../application/ports/car-booking-repository.port';
import type {
  CarBookingEntity,
  CreateCarBookingInput,
  UpdateCarBookingInput,
} from '../../domain/entities/car-booking.entity';
import type { BookingStatus } from '../../../../shared/booking/booking-state-machine';

@Injectable()
export class PrismaCarBookingRepository implements CarBookingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCarBookingInput): Promise<CarBookingEntity> {
    return this.prisma.carBooking.create({
      data: {
        ...data,
        customerSnapshot: data.customerSnapshot as never,
        fleetSnapshot: data.fleetSnapshot as never,
        pricingSnapshot: data.pricingSnapshot as never,
        workflowTrace: data.workflowTrace as never,
      },
    }) as unknown as Promise<CarBookingEntity>;
  }

  async update(
    id: string,
    patch: UpdateCarBookingInput,
  ): Promise<CarBookingEntity> {
    return this.prisma.carBooking.update({
      where: { id },
      data: {
        ...patch,
        customerSnapshot:
          patch.customerSnapshot === undefined
            ? undefined
            : (patch.customerSnapshot as never),
        fleetSnapshot:
          patch.fleetSnapshot === undefined
            ? undefined
            : (patch.fleetSnapshot as never),
        pricingSnapshot:
          patch.pricingSnapshot === undefined
            ? undefined
            : (patch.pricingSnapshot as never),
        workflowTrace:
          patch.workflowTrace === undefined
            ? undefined
            : (patch.workflowTrace as never),
      },
    }) as unknown as Promise<CarBookingEntity>;
  }

  async findById(id: string): Promise<CarBookingEntity | null> {
    return this.prisma.carBooking.findUnique({
      where: { id },
    }) as unknown as Promise<CarBookingEntity | null>;
  }

  async findByPublicRef(publicRef: string): Promise<CarBookingEntity | null> {
    return this.prisma.carBooking.findUnique({
      where: { publicRef },
    }) as unknown as Promise<CarBookingEntity | null>;
  }

  async findByUserId(
    userId: string,
    criteria: CarBookingPageCriteria,
  ): Promise<CarBookingPageResult> {
    const page = Math.max(1, criteria.page);
    const pageSize = Math.max(1, criteria.pageSize);
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.carBooking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.carBooking.count({ where }),
    ]);

    return {
      items: items as unknown as CarBookingEntity[],
      total,
      page,
      pageSize,
    };
  }

  async findOverlappingRentals(
    criteria: OverlappingRentalCriteria,
  ): Promise<CarBookingEntity[]> {
    return this.prisma.carBooking.findMany({
      where: {
        fleetId: criteria.fleetId,
        serviceType: 'rental',
        status: { in: [...criteria.statuses] },
        pickupAt: { lt: criteria.dropoffAt },
        dropoffAt: { gt: criteria.pickupAt },
        ...(criteria.excludeBookingId
          ? { id: { not: criteria.excludeBookingId } }
          : {}),
      },
      orderBy: { pickupAt: 'asc' },
    }) as unknown as Promise<CarBookingEntity[]>;
  }

  async atomicClaimStatus(
    id: string,
    expectedStatus: BookingStatus,
    newStatus: BookingStatus,
  ): Promise<boolean> {
    const result = await this.prisma.carBooking.updateMany({
      where: { id, status: expectedStatus },
      data: { status: newStatus },
    });
    return result.count === 1;
  }
}
