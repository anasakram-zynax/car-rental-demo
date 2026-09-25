import { DomainError } from '../../../../shared/errors/domain-error.js';

export class BookingNotFoundError extends DomainError {
  constructor(reference: string) {
    super(`Booking "${reference}" was not found.`);
  }
}

export class CarNotAvailableError extends DomainError {
  constructor() {
    super('The selected car is not available for these dates.');
  }
}

export class InvalidBookingDateError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidBookingTransitionError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class RentalReturnAtRequiredError extends DomainError {
  constructor() {
    super('returnAt is required for a rental booking.');
  }
}

export class RentalDriverBirthDateRequiredError extends DomainError {
  constructor() {
    super('driverBirthDate is required for a rental booking.');
  }
}

export class RentalDriverLicenseRequiredError extends DomainError {
  constructor() {
    super('driverLicenseNumber is required for a rental booking.');
  }
}

export class RentalLocationsRequiredError extends DomainError {
  constructor() {
    super('Pickup and drop-off locations are required for a rental booking.');
  }
}

export class TransferPackageRequiredError extends DomainError {
  constructor() {
    super('transferPackageId is required for a transfer booking.');
  }
}

export class TransferPackageNotFoundForCarError extends DomainError {
  constructor() {
    super('The transfer package was not found for the selected car.');
  }
}

export class TransferReturnAtNotAllowedError extends DomainError {
  constructor() {
    super('returnAt must not be provided for a transfer booking.');
  }
}
