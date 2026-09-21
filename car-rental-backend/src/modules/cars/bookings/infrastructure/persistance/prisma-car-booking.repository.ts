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
        driverBirthDate: data.driverBirthDate,
        driverLicenseNumber: data.driverLicenseNumber,

        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,

        specialRequests: data.specialRequests,
      },
    });

    return CarBookingMapper.toDomain(booking);
  }

  async findByReference(reference: string): Promise<CarBooking | null> {
    const booking = await this.prisma.carBooking.findUnique({
      where: {
        reference,
      },
    });

    if (!booking) {
      return null;
    }

    return CarBookingMapper.toDomain(booking);
  }

  async findOverlapping(
    carId: string,
    pickupAt: Date,
    returnAt: Date,
  ): Promise<CarBooking[]> {
    const bookings = await this.prisma.carBooking.findMany({
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

    return bookings.map((booking) => CarBookingMapper.toDomain(booking));
  }

  async findAll(): Promise<CarBooking[]> {
    const bookings = await this.prisma.carBooking.findMany({
      orderBy: {
        createdAt: 'desc',
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
    });

    return CarBookingMapper.toDomain(booking);
  }
}
