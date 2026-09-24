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

export class InvalidCarSearchPriceRangeError extends DomainError {
  constructor() {
    super('minPrice must not be greater than maxPrice.');
  }
}
