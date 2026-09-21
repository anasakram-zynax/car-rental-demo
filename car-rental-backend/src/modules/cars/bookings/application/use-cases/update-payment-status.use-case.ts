import { Inject, Injectable } from '@nestjs/common';
import { CAR_BOOKING_REPOSITORY } from '../../infrastructure/car-booking-repository.token.js';
import type { CarBookingRepositoryPort } from '../ports/car-booking-repository.port.js';
import {
  assertPaymentTransitionAllowed,
  PaymentStatus,
} from '../../domain/payment-status.js';
import { BookingNotFoundError } from '../../domain/booking-errors.js';

@Injectable()
export class UpdatePaymentStatusUseCase {
  constructor(
    @Inject(CAR_BOOKING_REPOSITORY)
    private readonly bookingRepository: CarBookingRepositoryPort,
  ) {}

  async execute(reference: string, paymentStatus: PaymentStatus) {
    const booking = await this.bookingRepository.findByReference(reference);

    if (!booking) {
      throw new BookingNotFoundError(reference);
    }

    assertPaymentTransitionAllowed(booking.paymentStatus, paymentStatus);

    return this.bookingRepository.updatePaymentStatus(reference, paymentStatus);
  }
}
