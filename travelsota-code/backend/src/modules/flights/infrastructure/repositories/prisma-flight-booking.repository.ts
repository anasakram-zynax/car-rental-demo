import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { FlightBookingRepoPort } from '../../application/ports/flight-booking-repo.port';
import type { FlightBookingEntity, CreateFlightBookingInput, UpdateFlightBookingInput } from '../../domain/entities/flight-booking.entity';
import { assertTransition } from '../../../../shared/booking/booking-state-machine';

@Injectable()
export class PrismaFlightBookingRepository implements FlightBookingRepoPort {
  private readonly logger = new Logger(PrismaFlightBookingRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateFlightBookingInput): Promise<FlightBookingEntity> {
    const created = await this.prisma.flightBooking.create({
      data: {
        id: data.id,
        publicRef: data.publicRef,
        provider: data.provider,
        status: data.status,
        offerSnapshot: data.offerSnapshot as any,
        travelerSnapshot: data.travelerSnapshot as any,
        amount: data.amount,
        baseAmount: data.baseAmount,
        currency: data.currency,
        workbenchId: data.workbenchId,
        reservationId: data.reservationId,
        locatorCode: data.locatorCode,
        holdExpiresAt: data.holdExpiresAt ? new Date(data.holdExpiresAt) : undefined,
        supplierHoldExpiresAt: data.supplierHoldExpiresAt ? new Date(data.supplierHoldExpiresAt) : undefined,
        adminHoldExpiresAt: data.adminHoldExpiresAt ? new Date(data.adminHoldExpiresAt) : undefined,
        receiptUrl: data.receiptUrl,
        workflowSummary: data.workflowSummary as any,
        message: data.message,
        userId: data.userId,
        rateSnapshot: data.rateSnapshot as any,
      },
    });

    return this.mapToEntity(created);
  }

  async update(id: string, patch: UpdateFlightBookingInput): Promise<FlightBookingEntity | null> {
    const updated = await this.prisma.flightBooking.update({
      where: { id },
      data: {
        status: patch.status,
        amount: patch.amount,
        baseAmount: patch.baseAmount,
        currency: patch.currency,
        workbenchId: patch.workbenchId,
        reservationId: patch.reservationId,
        locatorCode: patch.locatorCode,
        holdExpiresAt: patch.holdExpiresAt ? new Date(patch.holdExpiresAt) : undefined,
        supplierHoldExpiresAt: patch.supplierHoldExpiresAt ? new Date(patch.supplierHoldExpiresAt) : undefined,
        adminHoldExpiresAt: patch.adminHoldExpiresAt ? new Date(patch.adminHoldExpiresAt) : undefined,
        receiptUrl: patch.receiptUrl,
        workflowSummary: patch.workflowSummary as any,
        message: patch.message,
        // These two were declared on UpdateFlightBookingInput but never
        // actually mapped here, so every `.update(id, { offerSnapshot })`
        // call across the codebase (flight-booking-public.service.ts's
        // fare-rules persistence, Duffel conditions self-heal, etc.)
        // silently no-opped on this field — the write succeeded, every
        // other field applied, but offerSnapshot itself was never
        // persisted. That's why booking records never carried the
        // refundPolicy/changePolicy shown at search/snapshot time through
        // to the success page, admin detail view, or cancel estimate.
        offerSnapshot: patch.offerSnapshot as any,
        extrasStatus: patch.extrasStatus,
        ...(patch.rateSnapshot !== undefined ? { rateSnapshot: patch.rateSnapshot as any } : {}),
      },
    });

    return this.mapToEntity(updated);
  }

  async atomicClaimStatus(
    id: string,
    expectedStatus: string,
    newStatus: string,
    message?: string,
  ): Promise<boolean> {
    const result = await this.prisma.flightBooking.updateMany({
      where: { id, status: expectedStatus },
      data: {
        status: newStatus,
        ...(message !== undefined ? { message } : {}),
      },
    });
    return result.count > 0;
  }

  async transitionStatus(
    id: string,
    fromStatus: string,
    toStatus: string,
    message?: string,
  ): Promise<FlightBookingEntity | null> {
    const valid = assertTransition(fromStatus, toStatus);
    if (!valid) {
      this.logger.warn(
        `[StateMachine] Invalid transition ${fromStatus} → ${toStatus} for booking ${id} — proceeding anyway (advisory)`,
      );
    }

    const updated = await this.prisma.flightBooking.update({
      where: { id, status: fromStatus },
      data: {
        status: toStatus,
        ...(message !== undefined ? { message } : {}),
      },
    });

    return this.mapToEntity(updated);
  }

  async findById(id: string): Promise<FlightBookingEntity | null> {
    const booking = await this.prisma.flightBooking.findUnique({
      where: { id },
    });

    if (!booking) return null;
    return this.mapToEntity(booking);
  }

  // list() only — capped + narrow: the mapped view needs 9 scalars, never
  // snapshots. Admin callers must use the admin feed, not this.
  private static readonly LIST_TAKE = 200;

  async findAll(): Promise<FlightBookingEntity[]> {
    const bookings = await this.prisma.flightBooking.findMany({
      orderBy: { createdAt: 'desc' },
      take: PrismaFlightBookingRepository.LIST_TAKE,
      select: {
        id: true, status: true, provider: true, amount: true,
        currency: true, locatorCode: true, message: true,
        createdAt: true, updatedAt: true,
      },
    });

    return bookings.map((b) => this.mapToEntity(b));
  }

  async findByUserId(userId: string): Promise<FlightBookingEntity[]> {
    const bookings = await this.prisma.flightBooking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PrismaFlightBookingRepository.LIST_TAKE,
      select: {
        id: true, status: true, provider: true, amount: true,
        currency: true, locatorCode: true, message: true,
        createdAt: true, updatedAt: true,
      },
    });

    return bookings.map((b) => this.mapToEntity(b));
  }

  async findPendingByUserAndOffer(userId: string, offerId: string): Promise<FlightBookingEntity | null> {
    const booking = await this.prisma.flightBooking.findFirst({
      where: {
        userId,
        status: 'pending_payment',
        offerSnapshot: {
          path: ['offerId'],
          equals: offerId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return booking ? this.mapToEntity(booking) : null;
  }

  private mapToEntity(dbRecord: any): FlightBookingEntity {
    return {
      id: dbRecord.id,
      publicRef: dbRecord.publicRef ?? null,
      provider: dbRecord.provider as 'travelport',
      status: dbRecord.status as any,
      createdAt: dbRecord.createdAt.toISOString(),
      updatedAt: dbRecord.updatedAt.toISOString(),
      offerSnapshot: dbRecord.offerSnapshot as any,
      travelerSnapshot: dbRecord.travelerSnapshot as any,
      amount: dbRecord.amount ?? null,
      baseAmount: dbRecord.baseAmount ?? null,
      currency: dbRecord.currency ?? null,
      workbenchId: dbRecord.workbenchId ?? undefined,
      reservationId: dbRecord.reservationId ?? undefined,
      locatorCode: dbRecord.locatorCode ?? undefined,
      holdExpiresAt: dbRecord.holdExpiresAt?.toISOString(),
      supplierHoldExpiresAt: dbRecord.supplierHoldExpiresAt?.toISOString(),
      adminHoldExpiresAt: dbRecord.adminHoldExpiresAt?.toISOString(),
      receiptUrl: dbRecord.receiptUrl ?? undefined,
      workflowSummary: dbRecord.workflowSummary ?? undefined,
      message: dbRecord.message ?? undefined,
      userId: dbRecord.userId ?? undefined,
      extrasStatus: dbRecord.extrasStatus ?? undefined,
      extrasTotalAmount: dbRecord.extrasTotalAmount ? Number(dbRecord.extrasTotalAmount) : undefined,
      extrasCurrency: dbRecord.extrasCurrency ?? undefined,
      lastExtrasSyncAt: dbRecord.lastExtrasSyncAt?.toISOString() ?? undefined,
      rateSnapshot: dbRecord.rateSnapshot ?? undefined,
    };
  }
}
