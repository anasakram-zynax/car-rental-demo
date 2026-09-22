import { Inject, Injectable } from '@nestjs/common';
import { CAR_BOOKING_REPOSITORY } from '../../infrastructure/car-booking-repository.token.js';
import type { CarBookingRepositoryPort } from '../ports/car-booking-repository.port.js';
import { CAR_LOOKUP } from '../../infrastructure/car-lookup.token.js';
import type { CarLookupPort } from '../ports/car-lookup.port.js';
import {
  calculateRentalDays,
  validateDateRange,
} from '../../domain/date-range.js';
import {
  CarNotAvailableError,
  InvalidBookingDateError,
} from '../../domain/booking-errors.js';
import { calculateRentalPrice } from '../../domain/rental-price.js';

export interface CreateBookingInput {
  carId: string;

  pickupLocation: string;
  dropoffLocation: string;

  pickupAt: Date;
  returnAt: Date;

  driverFirstName: string;
  driverLastName: string;
  driverBirthDate: Date;
  driverLicenseNumber: string;

  contactEmail: string;
  contactPhone: string;

  specialRequests?: string;
}

@Injectable()
export class CreateBookingUseCase {
  constructor(
    @Inject(CAR_BOOKING_REPOSITORY)
    private readonly bookingRepository: CarBookingRepositoryPort,

    @Inject(CAR_LOOKUP)
    private readonly carLookup: CarLookupPort,
  ) {}

  async execute(input: CreateBookingInput) {
    validateDateRange(input.pickupAt, input.returnAt);

    if (input.pickupAt <= new Date()) {
      throw new InvalidBookingDateError('Pickup date must be in the future.');
    }

    const car = await this.carLookup.findById(input.carId);

    if (!car || !car.active) {
      throw new CarNotAvailableError();
    }

    const overlappingBookings = await this.bookingRepository.findOverlapping(
      input.carId,
      input.pickupAt,
      input.returnAt,
    );

    if (overlappingBookings.length > 0) {
      throw new CarNotAvailableError();
    }

    const rentalDays = calculateRentalDays(input.pickupAt, input.returnAt);

    const price = calculateRentalPrice(rentalDays, car.dailyPrice);

    const reference = this.generateReference();

    return this.bookingRepository.create({
      reference,

      carId: input.carId,

      pickupLocation: input.pickupLocation,
      dropoffLocation: input.dropoffLocation,

      pickupAt: input.pickupAt,
      returnAt: input.returnAt,

      rentalDays,

      dailyPrice: car.dailyPrice,
      taxAmount: price.taxAmount,
      totalPrice: price.totalPrice,
      currency: car.currency,

      driverFirstName: input.driverFirstName,
      driverLastName: input.driverLastName,
      driverBirthDate: input.driverBirthDate,
      driverLicenseNumber: input.driverLicenseNumber,

      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,

      specialRequests: input.specialRequests,
    });
  }

  private generateReference(): string {
    return `CR-${crypto
      .randomUUID()
      .replaceAll('-', '')
      .slice(0, 10)
      .toUpperCase()}`;
  }
}
