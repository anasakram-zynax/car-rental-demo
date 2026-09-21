import type {
  CarBookingRepositoryPort,
  CreateBookingData,
} from '../../application/ports/car-booking-repository.port.js';

import type { CarBooking } from '../../domain/car-booking.entity.js';

import { BookingStatus } from '../../domain/booking-status.js';

import { PaymentStatus } from '../../domain/payment-status.js';

export class InMemoryCarBookingRepository implements CarBookingRepositoryPort {
  public bookings: CarBooking[] = [];

  async create(data: CreateBookingData): Promise<CarBooking> {
    const now = new Date();

    const booking: CarBooking = {
      id: crypto.randomUUID(),

      ...data,

      bookingStatus: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.UNPAID,

      cancelReason: null,

      specialRequests: data.specialRequests ?? null,

      createdAt: now,
      updatedAt: now,
    };

    this.bookings.push(booking);

    return booking;
  }

  async findByReference(reference: string): Promise<CarBooking | null> {
    return (
      this.bookings.find((booking) => booking.reference === reference) ?? null
    );
  }

  async findAll(): Promise<CarBooking[]> {
    return [...this.bookings];
  }

  async findOverlapping(
    carId: string,
    pickupAt: Date,
    returnAt: Date,
  ): Promise<CarBooking[]> {
    return this.bookings.filter(
      (booking) =>
        booking.carId === carId &&
        booking.bookingStatus === BookingStatus.CONFIRMED &&
        booking.pickupAt < returnAt &&
        booking.returnAt > pickupAt,
    );
  }

  async cancel(reference: string, reason?: string): Promise<CarBooking> {
    const booking = await this.findByReference(reference);

    if (!booking) {
      throw new Error('Booking not found');
    }

    booking.bookingStatus = BookingStatus.CANCELLED;

    booking.cancelReason = reason ?? null;
    booking.updatedAt = new Date();

    return booking;
  }

  async updatePaymentStatus(
    reference: string,
    paymentStatus: PaymentStatus,
  ): Promise<CarBooking> {
    const booking = await this.findByReference(reference);

    if (!booking) {
      throw new Error('Booking not found');
    }

    booking.paymentStatus = paymentStatus;
    booking.updatedAt = new Date();

    return booking;
  }
}
