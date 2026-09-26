import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { FlightBookingExtraRepoPort } from '../../application/ports/flight-booking-extra-repo.port';
import type {
  FlightBookingExtraEntity,
  CreateFlightBookingExtraInput,
  UpdateFlightBookingExtraInput,
} from '../../domain/entities/flight-booking-extra.entity';

@Injectable()
export class PrismaFlightBookingExtraRepository implements FlightBookingExtraRepoPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateFlightBookingExtraInput): Promise<FlightBookingExtraEntity> {
    const created = await this.prisma.flightBookingExtra.create({
      data: {
        bookingId: data.bookingId,
        provider: data.provider,
        contentSource: data.contentSource,
        type: data.type,
        status: data.status,
        label: data.label,
        description: data.description,
        travelerIndex: data.travelerIndex,
        travelerRef: data.travelerRef,
        segmentRef: data.segmentRef,
        segmentLabel: data.segmentLabel,
        productRef: data.productRef,
        supplierCatalogOfferingsIdentifier: data.supplierCatalogOfferingsIdentifier,
        supplierCatalogOfferingIdentifier: data.supplierCatalogOfferingIdentifier,
        supplierProductIdentifier: data.supplierProductIdentifier,
        supplierOfferIdentifier: data.supplierOfferIdentifier,
        supplierReservationIdentifier: data.supplierReservationIdentifier,
        amount: data.amount,
        currency: data.currency,
        paymentId: data.paymentId,
        supplierErrorCode: data.supplierErrorCode,
        supplierErrorMessage: data.supplierErrorMessage,
        rawSupplierPayload: data.rawSupplierPayload as any,
        rawSupplierResponse: data.rawSupplierResponse as any,
      },
    });

    return this.mapToEntity(created);
  }

  async update(
    id: string,
    patch: UpdateFlightBookingExtraInput,
  ): Promise<FlightBookingExtraEntity | null> {
    const updated = await this.prisma.flightBookingExtra.update({
      where: { id },
      data: {
        status: patch.status,
        supplierCatalogOfferingsIdentifier: patch.supplierCatalogOfferingsIdentifier,
        supplierCatalogOfferingIdentifier: patch.supplierCatalogOfferingIdentifier,
        supplierProductIdentifier: patch.supplierProductIdentifier,
        supplierOfferIdentifier: patch.supplierOfferIdentifier,
        supplierReservationIdentifier: patch.supplierReservationIdentifier,
        paymentId: patch.paymentId,
        supplierErrorCode: patch.supplierErrorCode,
        supplierErrorMessage: patch.supplierErrorMessage,
        rawSupplierPayload: patch.rawSupplierPayload as any,
        rawSupplierResponse: patch.rawSupplierResponse as any,
      },
    });

    return this.mapToEntity(updated);
  }

  async findById(id: string): Promise<FlightBookingExtraEntity | null> {
    const record = await this.prisma.flightBookingExtra.findUnique({
      where: { id },
    });

    if (!record) return null;
    return this.mapToEntity(record);
  }

  async findByBookingId(bookingId: string): Promise<FlightBookingExtraEntity[]> {
    const records = await this.prisma.flightBookingExtra.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.mapToEntity(r));
  }

  async findByBookingIdAndType(
    bookingId: string,
    type: string,
  ): Promise<FlightBookingExtraEntity[]> {
    const records = await this.prisma.flightBookingExtra.findMany({
      where: { bookingId, type },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.mapToEntity(r));
  }

  async findByBookingIdAndStatus(
    bookingId: string,
    status: string,
  ): Promise<FlightBookingExtraEntity[]> {
    const records = await this.prisma.flightBookingExtra.findMany({
      where: { bookingId, status },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.mapToEntity(r));
  }

  private mapToEntity(record: any): FlightBookingExtraEntity {
    return {
      id: record.id,
      bookingId: record.bookingId,
      provider: record.provider,
      contentSource: record.contentSource,
      type: record.type as any,
      status: record.status as any,
      label: record.label ?? undefined,
      description: record.description ?? undefined,
      travelerIndex: record.travelerIndex ?? undefined,
      travelerRef: record.travelerRef ?? undefined,
      segmentRef: record.segmentRef ?? undefined,
      segmentLabel: record.segmentLabel ?? undefined,
      productRef: record.productRef ?? undefined,
      supplierCatalogOfferingsIdentifier: record.supplierCatalogOfferingsIdentifier ?? undefined,
      supplierCatalogOfferingIdentifier: record.supplierCatalogOfferingIdentifier ?? undefined,
      supplierProductIdentifier: record.supplierProductIdentifier ?? undefined,
      supplierOfferIdentifier: record.supplierOfferIdentifier ?? undefined,
      supplierReservationIdentifier: record.supplierReservationIdentifier ?? undefined,
      amount: Number(record.amount),
      currency: record.currency,
      paymentId: record.paymentId ?? undefined,
      supplierErrorCode: record.supplierErrorCode ?? undefined,
      supplierErrorMessage: record.supplierErrorMessage ?? undefined,
      rawSupplierPayload: record.rawSupplierPayload ?? undefined,
      rawSupplierResponse: record.rawSupplierResponse ?? undefined,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
