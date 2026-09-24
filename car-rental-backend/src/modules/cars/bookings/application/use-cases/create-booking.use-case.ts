import { Inject, Injectable } from '@nestjs/common';
import { CAR_BOOKING_REPOSITORY } from '../../infrastructure/car-booking-repository.token.js';
import type { CarBookingRepositoryPort } from '../ports/car-booking-repository.port.js';
import { CAR_LOOKUP } from '../../infrastructure/car-lookup.token.js';
import type {
  CarLookupPort,
  CarLookupResult,
} from '../ports/car-lookup.port.js';
import {
  calculateRentalDays,
  validateDateRange,
} from '../../domain/date-range.js';
import {
  CarNotAvailableError,
  InvalidBookingDateError,
  RentalDriverBirthDateRequiredError,
  RentalDriverLicenseRequiredError,
  RentalLocationsRequiredError,
  RentalReturnAtRequiredError,
  TransferPackageNotFoundForCarError,
  TransferPackageRequiredError,
  TransferReturnAtNotAllowedError,
} from '../../domain/booking-errors.js';
import { calculateRentalPrice } from '../../domain/rental-price.js';
import { DEFAULT_TRANSFER_DURATION_HOURS } from '../../domain/transfer-booking.js';

export interface CreateBookingInput {
  carId: string;
  transferPackageId?: string;

  pickupLocation?: string;
  dropoffLocation?: string;

  pickupAt: Date;
  returnAt?: Date;

  driverFirstName: string;
  driverLastName: string;
  driverBirthDate?: Date;
  driverLicenseNumber?: string;

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
    const car = await this.carLookup.findById(input.carId);

    if (!car || !car.active) {
      throw new CarNotAvailableError();
    }

    const booking =
      car.serviceType === 'transfer'
        ? this.prepareTransferBooking(input, car)
        : this.prepareRentalBooking(input, car);

    if (booking.pickupAt <= new Date()) {
      throw new InvalidBookingDateError('Pickup date must be in the future.');
    }

    const overlappingConfirmedCount =
      await this.bookingRepository.countOverlappingConfirmed(
        input.carId,
        booking.pickupAt,
        booking.returnAt,
      );

    if (overlappingConfirmedCount >= car.availableQuantity) {
      throw new CarNotAvailableError();
    }

    const reference = this.generateReference();

    return this.bookingRepository.create({
      reference,

      carId: input.carId,
      transferPackageId: booking.transferPackageId,

      pickupLocation: booking.pickupLocation,
      dropoffLocation: booking.dropoffLocation,

      pickupAt: booking.pickupAt,
      returnAt: booking.returnAt,

      rentalDays: booking.rentalDays,

      dailyPrice: booking.unitPrice,
      taxAmount: booking.taxAmount,
      totalPrice: booking.totalPrice,
      currency: booking.currency,

      driverFirstName: input.driverFirstName,
      driverLastName: input.driverLastName,
      driverBirthDate: input.driverBirthDate,
      driverLicenseNumber: input.driverLicenseNumber,

      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,

      specialRequests: input.specialRequests,
    });
  }

  private prepareRentalBooking(
    input: CreateBookingInput,
    car: CarLookupResult,
  ) {
    if (!input.returnAt) {
      throw new RentalReturnAtRequiredError();
    }

    if (!input.pickupLocation || !input.dropoffLocation) {
      throw new RentalLocationsRequiredError();
    }

    if (!input.driverBirthDate) {
      throw new RentalDriverBirthDateRequiredError();
    }

    if (!input.driverLicenseNumber) {
      throw new RentalDriverLicenseRequiredError();
    }

    validateDateRange(input.pickupAt, input.returnAt);
    const rentalDays = calculateRentalDays(input.pickupAt, input.returnAt);
    const price = calculateRentalPrice(rentalDays, car.dailyPrice);

    return {
      transferPackageId: undefined,
      pickupLocation: input.pickupLocation,
      dropoffLocation: input.dropoffLocation,
      pickupAt: input.pickupAt,
      returnAt: input.returnAt,
      rentalDays,
      unitPrice: car.dailyPrice,
      taxAmount: price.taxAmount,
      totalPrice: price.totalPrice,
      currency: car.currency,
    };
  }

  private prepareTransferBooking(
    input: CreateBookingInput,
    car: CarLookupResult,
  ) {
    if (input.returnAt) {
      throw new TransferReturnAtNotAllowedError();
    }

    if (!input.transferPackageId) {
      throw new TransferPackageRequiredError();
    }

    const transferPackage = car.transferPackages.find(
      (item) => item.id === input.transferPackageId,
    );

    if (!transferPackage) {
      throw new TransferPackageNotFoundForCarError();
    }

    const returnAt = new Date(
      input.pickupAt.getTime() +
        DEFAULT_TRANSFER_DURATION_HOURS * 60 * 60 * 1000,
    );

    return {
      transferPackageId: transferPackage.id,
      pickupLocation: transferPackage.fromLocation,
      dropoffLocation: transferPackage.toLocation,
      pickupAt: input.pickupAt,
      returnAt,
      rentalDays: 0,
      unitPrice: transferPackage.price,
      taxAmount: 0,
      totalPrice: transferPackage.price,
      currency: transferPackage.currency,
    };
  }

  private generateReference(): string {
    return `CR-${crypto
      .randomUUID()
      .replaceAll('-', '')
      .slice(0, 10)
      .toUpperCase()}`;
  }
}
