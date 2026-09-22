import { Inject, Injectable } from '@nestjs/common';
import { CAR_BOOKING_REPOSITORY } from '../../infrastructure/car-booking-repository.token.js';
import type { CarBookingRepositoryPort } from '../ports/car-booking-repository.port.js';
import { BookingNotFoundError } from '../../domain/booking-errors.js';

@Injectable()
export class GetBookingUseCase {
  constructor(
    @Inject(CAR_BOOKING_REPOSITORY)
    private readonly bookingRepository: CarBookingRepositoryPort,
  ) {}

  async execute(reference: string) {
    const booking = await this.bookingRepository.findByReference(reference);

    if (!booking) {
      throw new BookingNotFoundError(reference);
    }

    return booking;
  }
}
