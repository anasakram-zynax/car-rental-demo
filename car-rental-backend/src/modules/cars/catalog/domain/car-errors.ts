import { DomainError } from '../../../../shared/errors/domain-error.js';

export class CarNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Car with id ${id} was not found.`);
  }
}

export class InvalidCarDataError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class CarSlugAlreadyExistsError extends DomainError {
  constructor() {
    super('A car with this slug already exists.');
  }
}

export class CarImageOwnershipError extends DomainError {
  constructor() {
    super('This image does not belong to the selected car.');
  }
}

export class LegacyCarImageDeletionError extends DomainError {
  constructor() {
    super(
      'This legacy image has no verified Cloudinary public ID and cannot be deleted safely. It has not been removed.',
    );
  }
}

export class InvalidCarSearchPriceRangeError extends DomainError {
  constructor() {
    super('minPrice must not be greater than maxPrice.');
  }
}
