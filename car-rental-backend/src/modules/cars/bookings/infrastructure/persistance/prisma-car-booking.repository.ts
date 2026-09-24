import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/database/prisma.service.js';
import type {
  CarBookingRepositoryPort,
  CreateBookingData,
} from '../../application/ports/car-booking-repository.port.js';
import type { CarBooking } from '../../domain/car-booking.entity.js';
import { CarBookingMapper } from './car-booking.mapper.js';
import { PaymentStatus } from '../../domain/payment-status.js';

@Injectable()
export class PrismaCarBookingRepository implements CarBookingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateBookingData): Promise<CarBooking> {
    const booking = await this.prisma.carBooking.create({
      data: {
        reference: data.reference,

        carId: data.carId,
        transferPackageId: data.transferPackageId ?? null,

        pickupLocation: data.pickupLocation,
        dropoffLocation: data.dropoffLocation,

        pickupAt: data.pickupAt,
        returnAt: data.returnAt,

        rentalDays: data.rentalDays,

        dailyPrice: data.dailyPrice,
        taxAmount: data.taxAmount,
        totalPrice: data.totalPrice,
        currency: data.currency,

        driverFirstName: data.driverFirstName,
        driverLastName: data.driverLastName,
        driverBirthDate: data.driverBirthDate ?? null,
        driverLicenseNumber: data.driverLicenseNumber ?? null,

        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,

        specialRequests: data.specialRequests,
      },
      include: {
        transferPackage: true,
      },
    });

    return CarBookingMapper.toDomain(booking);
  }

  async findByReference(reference: string): Promise<CarBooking | null> {
    const booking = await this.prisma.carBooking.findUnique({
      where: {
        reference,
      },
      include: {
        transferPackage: true,
      },
    });

    if (!booking) {
      return null;
    }

    return CarBookingMapper.toDomain(booking);
  }

  countOverlappingConfirmed(
    carId: string,
    pickupAt: Date,
    returnAt: Date,
  ): Promise<number> {
    return this.prisma.carBooking.count({
      where: {
        carId,

        bookingStatus: 'CONFIRMED',

        pickupAt: {
          lt: returnAt,
        },

        returnAt: {
          gt: pickupAt,
        },
      },
    });
  }

  async findAll(): Promise<CarBooking[]> {
    const bookings = await this.prisma.carBooking.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        transferPackage: true,
      },
    });

    return bookings.map((booking) => CarBookingMapper.toDomain(booking));
  }

  async cancel(reference: string, reason?: string): Promise<CarBooking> {
    const booking = await this.prisma.carBooking.update({
      where: {
        reference,
      },

      data: {
        bookingStatus: 'CANCELLED',
        cancelReason: reason ?? null,
      },
      include: {
        transferPackage: true,
      },
    });

    return CarBookingMapper.toDomain(booking);
  }

  async updatePaymentStatus(
    reference: string,
    paymentStatus: PaymentStatus,
  ): Promise<CarBooking> {
    const prismaStatus =
      paymentStatus === 'paid'
        ? 'PAID'
        : paymentStatus === 'refunded'
          ? 'REFUNDED'
          : 'UNPAID';

    const booking = await this.prisma.carBooking.update({
      where: {
        reference,
      },

      data: {
        paymentStatus: prismaStatus,
      },
      include: {
        transferPackage: true,
      },
    });

    return CarBookingMapper.toDomain(booking);
  }
}
