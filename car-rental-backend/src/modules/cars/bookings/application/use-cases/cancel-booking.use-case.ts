import { Inject, Injectable } from '@nestjs/common';
import { CAR_BOOKING_REPOSITORY } from '../../infrastructure/car-booking-repository.token.js';
import type { CarBookingRepositoryPort } from '../ports/car-booking-repository.port.js';
import { BookingNotFoundError } from '../../domain/booking-errors.js';
import { assertCanCancelBooking } from '../../domain/booking-status.js';
import { assertCancellationAllowed } from '../../domain/cancellation-policy.js';

@Injectable()
export class CancelBookingUseCase {
  constructor(
    @Inject(CAR_BOOKING_REPOSITORY)
    private readonly bookingRepository: CarBookingRepositoryPort,
  ) {}

  async execute(reference: string, reason?: string) {
    const booking = await this.bookingRepository.findByReference(reference);

    if (!booking) {
      throw new BookingNotFoundError(reference);
    }

    assertCanCancelBooking(booking.bookingStatus);

    assertCancellationAllowed(booking.pickupAt, new Date());

    return this.bookingRepository.cancel(reference, reason);
  }
}
