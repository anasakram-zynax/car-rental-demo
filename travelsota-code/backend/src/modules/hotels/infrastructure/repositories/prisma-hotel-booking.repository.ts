import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { HotelBookingRepoPort } from '../../application/ports/hotel-booking-repo.port';
import type { HotelBookingEntity, CreateHotelBookingInput, UpdateHotelBookingInput } from '../../domain/entities/hotel-booking.entity';

@Injectable()
export class PrismaHotelBookingRepository implements HotelBookingRepoPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateHotelBookingInput): Promise<HotelBookingEntity> {
    return this.prisma.hotelBooking.create({
      data: {
        id: data.id,
        publicRef: data.publicRef,
        provider: data.provider,
        status: data.status,

        // Provider-neutral fields
        searchKey: data.searchKey,
        hotelId: data.hotelId,
        providerHotelId: data.providerHotelId,
        supplierRateId: data.supplierRateId,
        supplierReference: data.supplierReference,
        supplierStatus: data.supplierStatus,
        supplierBookingId: data.supplierBookingId,
        supplierOrderId: data.supplierOrderId,
        supplierItemId: data.supplierItemId,
        prebookToken: data.prebookToken,
        prebookExpiresAt: data.prebookExpiresAt,
        partnerOrderId: data.partnerOrderId,
        hotelConfirmationNumber: data.hotelConfirmationNumber,
        hotelConfirmationStatus: data.hotelConfirmationStatus,
        hotelConfirmationLastCheckedAt: data.hotelConfirmationLastCheckedAt,
        hotelConfirmationNextCheckAt: data.hotelConfirmationNextCheckAt,
        hotelConfirmationAttempts: data.hotelConfirmationAttempts,
        supplierErrorCode: data.supplierErrorCode,
        supplierErrorText: data.supplierErrorText,
        guests: data.guests as any,
        supplierAmount: data.supplierAmount,
        supplierCurrency: data.supplierCurrency,
        customerAmount: data.customerAmount,
        customerCurrency: data.customerCurrency,
        markupAmount: data.markupAmount,
        markupSnapshot: data.markupSnapshot as any,
        rateSnapshot: data.rateSnapshot as any,
        supplierPayload: data.supplierPayload as any,
        workflowTrace: data.workflowTrace as any,

        // Legacy fields (kept for backward compatibility)
        rateKey: data.rateKey,
        holder: data.holder as any,
        clientReference: data.clientReference,
        paxes: data.paxes as any,
        amount: data.amount,
        currency: data.currency,
        hotelbedsRef: data.hotelbedsRef,
        hotelbedsStatus: data.hotelbedsStatus,
        hotelSnapshot: data.hotelSnapshot as any,
        priceSnapshot: data.priceSnapshot as any,
        message: data.message,
        receiptUrl: data.receiptUrl,
        userId: data.userId,
      },
    }) as unknown as HotelBookingEntity;
  }

  async update(id: string, patch: UpdateHotelBookingInput): Promise<HotelBookingEntity> {
    return this.prisma.hotelBooking.update({
      where: { id },
      data: {
        // Provider-neutral fields
        searchKey: patch.searchKey,
        hotelId: patch.hotelId,
        providerHotelId: patch.providerHotelId,
        supplierRateId: patch.supplierRateId,
        supplierReference: patch.supplierReference,
        supplierStatus: patch.supplierStatus,
        supplierBookingId: patch.supplierBookingId,
        supplierOrderId: patch.supplierOrderId,
        supplierItemId: patch.supplierItemId,
        prebookToken: patch.prebookToken,
        prebookExpiresAt: patch.prebookExpiresAt,
        partnerOrderId: patch.partnerOrderId,
        hotelConfirmationNumber: patch.hotelConfirmationNumber,
        hotelConfirmationStatus: patch.hotelConfirmationStatus,
        hotelConfirmationLastCheckedAt: patch.hotelConfirmationLastCheckedAt,
        hotelConfirmationNextCheckAt: patch.hotelConfirmationNextCheckAt,
        hotelConfirmationAttempts: patch.hotelConfirmationAttempts,
        supplierErrorCode: patch.supplierErrorCode,
        supplierErrorText: patch.supplierErrorText,
        guests: patch.guests as any,
        supplierAmount: patch.supplierAmount,
        supplierCurrency: patch.supplierCurrency,
        customerAmount: patch.customerAmount,
        customerCurrency: patch.customerCurrency,
        markupAmount: patch.markupAmount,
        markupSnapshot: patch.markupSnapshot as any,
        rateSnapshot: patch.rateSnapshot as any,
        supplierPayload: patch.supplierPayload as any,
        workflowTrace: patch.workflowTrace as any,

        // Legacy fields (kept for backward compatibility)
        status: patch.status,
        rateKey: patch.rateKey,
        amount: patch.amount,
        currency: patch.currency,
        hotelbedsRef: patch.hotelbedsRef,
        hotelbedsStatus: patch.hotelbedsStatus,
        hotelSnapshot: patch.hotelSnapshot as any,
        priceSnapshot: patch.priceSnapshot as any,
        message: patch.message,
        receiptUrl: patch.receiptUrl,
      },
    }) as unknown as HotelBookingEntity;
  }

  async findById(id: string): Promise<HotelBookingEntity | null> {
    return this.prisma.hotelBooking.findUnique({
      where: { id },
    }) as unknown as HotelBookingEntity | null;
  }

  // list() only — capped: the mapped view needs scalars + hotelSnapshot,
  // never the other blobs. Admin callers must use the admin feed, not this.
  private static readonly LIST_TAKE = 200;

  async findAll(): Promise<HotelBookingEntity[]> {
    return this.prisma.hotelBooking.findMany({
      orderBy: { createdAt: 'desc' },
      take: PrismaHotelBookingRepository.LIST_TAKE,
      select: {
        id: true, provider: true, status: true, supplierOrderId: true,
        hotelConfirmationNumber: true, hotelConfirmationStatus: true,
        supplierReference: true, hotelbedsRef: true, customerAmount: true,
        customerCurrency: true, supplierAmount: true, amount: true,
        currency: true, hotelSnapshot: true, message: true,
        createdAt: true, updatedAt: true,
      },
    }) as unknown as HotelBookingEntity[];
  }

  async findByUserId(userId: string): Promise<HotelBookingEntity[]> {
    return this.prisma.hotelBooking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PrismaHotelBookingRepository.LIST_TAKE,
      select: {
        id: true, provider: true, status: true, supplierOrderId: true,
        hotelConfirmationNumber: true, hotelConfirmationStatus: true,
        supplierReference: true, hotelbedsRef: true, customerAmount: true,
        customerCurrency: true, supplierAmount: true, amount: true,
        currency: true, hotelSnapshot: true, message: true,
        createdAt: true, updatedAt: true,
      },
    }) as unknown as HotelBookingEntity[];
  }

  async findByPartnerOrderId(partnerOrderId: string): Promise<HotelBookingEntity | null> {
    return this.prisma.hotelBooking.findFirst({
      where: { partnerOrderId },
    }) as unknown as HotelBookingEntity | null;
  }

  async findRatehawkWebhookTimeouts(cutoff: Date, limit = 10): Promise<HotelBookingEntity[]> {
    return this.prisma.hotelBooking.findMany({
      where: {
        provider: 'ratehawk',
        status: 'booking_in_progress',
        supplierStatus: 'waiting_webhook',
        partnerOrderId: { not: null },
        updatedAt: { lte: cutoff },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    }) as unknown as HotelBookingEntity[];
  }

  async findPendingByUserAndRateKey(userId: string, rateKey: string): Promise<HotelBookingEntity | null> {
    return this.prisma.hotelBooking.findFirst({
      where: {
        userId,
        status: 'pending_payment',
        rateKey,
      },
      orderBy: { createdAt: 'desc' },
    }) as unknown as HotelBookingEntity | null;
  }

  async atomicClaimStatus(id: string, expectedStatus: string, newStatus: string, message?: string): Promise<boolean> {
    const result = await this.prisma.hotelBooking.updateMany({
      where: {
        id,
        status: expectedStatus,
      },
      data: {
        status: newStatus,
        ...(message !== undefined ? { message } : {}),
        updatedAt: new Date(),
      },
    });
    return result.count > 0;
  }

  async findPendingHotelConfirmation(now: Date, limit = 20): Promise<HotelBookingEntity[]> {
    return this.prisma.hotelBooking.findMany({
      where: {
        provider: 'ratehawk',
        status: 'booked',
        supplierOrderId: { not: null },
        hotelConfirmationStatus: { not: 'received' },
        AND: [
          { hotelConfirmationNextCheckAt: { lte: now } },
          { hotelConfirmationAttempts: { lt: 100 } },
        ],
      },
      orderBy: { hotelConfirmationNextCheckAt: 'asc' },
      take: limit,
    }) as unknown as HotelBookingEntity[];
  }
}
