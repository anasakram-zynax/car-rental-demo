import { DomainError } from "../../../../shared/errors/domain-error.js";

export class BookingNotFoundError extends DomainError{
    constructor(reference: string){
        super(`Booking "${reference}" was not found.`)
    }
}

export class CarNotAvailableError extends DomainError{
    constructor(){
        super('The selected car is not available for these dates.')
    }
}

export class InvalidBookingDateError extends DomainError{
    constructor(message:string){
        super(message)
    }
}

export class InvalidBookingTransitionError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}