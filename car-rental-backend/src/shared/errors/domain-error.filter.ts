import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { DomainError } from './domain-error.js';
import { Response } from 'express';
import { CarNotFoundError } from '../../modules/cars/catalog/domain/car-errors.js';
import { BookingNotFoundError } from '../../modules/cars/bookings/domain/booking-errors.js';

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost) {
    const context = host.switchToHttp();

    const response = context.getResponse<Response>();

    let status = HttpStatus.BAD_REQUEST;

    if (
      exception instanceof CarNotFoundError ||
      exception instanceof BookingNotFoundError
    ) {
      status = HttpStatus.NOT_FOUND;
    }

    response.status(status).json({
      success: false,
      message: exception.message,
      data: null,
    });
  }
}
