import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type {
  CarBookingPageCriteria,
  CarBookingPageResult,
  CarBookingRepositoryPort,
  AllocateRentalInput,
  AllocateRentalResult,
  OverlappingRentalCriteria,
} from '../../application/ports/car-booking-repository.port';
import type {
  CarBookingEntity,
  CreateCarBookingInput,
  UpdateCarBookingInput,
} from '../../domain/entities/car-booking.entity';
import type { BookingStatus } from '../../../../shared/booking/booking-state-machine';
import type { Prisma } from '../../../../generated';
import { halfOpenRentalBounds } from '../../domain/rental-availability.policy';

@Injectable()
export class PrismaCarBookingRepository implements CarBookingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCarBookingInput): Promise<CarBookingEntity> {
    return this.prisma.carBooking.create({
      data: this.toPrismaCreateData(data),
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
      where: this.overlapWhere(criteria),
      orderBy: { pickupAt: 'asc' },
    }) as unknown as Promise<CarBookingEntity[]>;
  }

  async sumOverlappingRentalQuantity(
    criteria: OverlappingRentalCriteria,
  ): Promise<number> {
    const result = await this.prisma.carBooking.aggregate({
      where: this.overlapWhere(criteria),
      _sum: { quantity: true },
    });
    return result._sum?.quantity ?? 0;
  }

  async allocateRental(
    input: AllocateRentalInput,
  ): Promise<AllocateRentalResult> {
    return this.prisma.$transaction(async (transaction) => {
      // Serialize allocations per fleet across every API instance. The lock is
      // held until the availability check and booking insert both commit.
      await transaction.$queryRaw`
        SELECT "id"
        FROM "CarFleet"
        WHERE "id" = ${input.booking.fleetId}
        FOR UPDATE
      `;

      const fleet = await transaction.carFleet.findUnique({
        where: { id: input.booking.fleetId },
      });
      if (!fleet) return { outcome: 'fleet_not_found' };
      if (!fleet.isActive) return { outcome: 'fleet_inactive' };
      if (!fleet.rentalEnabled) return { outcome: 'rental_disabled' };

      const duplicate = await transaction.carBooking.findUnique({
        where: { publicRef: input.booking.publicRef },
      });
      if (duplicate) {
        return {
          outcome: 'duplicate',
          booking: duplicate as unknown as CarBookingEntity,
        };
      }

      const reserved = await transaction.carBooking.aggregate({
        where: this.overlapWhere({
          fleetId: input.booking.fleetId,
          pickupAt: input.booking.pickupAt,
          dropoffAt: input.booking.dropoffAt!,
          statuses: input.statuses,
        }),
        _sum: { quantity: true },
      });
      const reservedQuantity = reserved._sum?.quantity ?? 0;
      if (reservedQuantity + input.booking.quantity > fleet.quantity) {
        return {
          outcome: 'insufficient',
          totalQuantity: fleet.quantity,
          reservedQuantity,
        };
      }

      const booking = await transaction.carBooking.create({
        data: this.toPrismaCreateData(input.booking),
      });
      return {
        outcome: 'created',
        booking: booking as unknown as CarBookingEntity,
        reservedQuantity: reservedQuantity + input.booking.quantity,
      };
    });
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

  private overlapWhere(
    criteria: OverlappingRentalCriteria,
  ): Prisma.CarBookingWhereInput {
    const bounds = halfOpenRentalBounds(criteria.pickupAt, criteria.dropoffAt);
    return {
      fleetId: criteria.fleetId,
      serviceType: 'rental',
      status: { in: [...criteria.statuses] },
      pickupAt: { lt: bounds.pickupBefore },
      dropoffAt: { gt: bounds.dropoffAfter },
      ...(criteria.excludeBookingId
        ? { id: { not: criteria.excludeBookingId } }
        : {}),
    };
  }

  private toPrismaCreateData(data: CreateCarBookingInput) {
    return {
      ...data,
      customerSnapshot: data.customerSnapshot as never,
      fleetSnapshot: data.fleetSnapshot as never,
      pricingSnapshot: data.pricingSnapshot as never,
      workflowTrace: data.workflowTrace as never,
    };
  }
}
