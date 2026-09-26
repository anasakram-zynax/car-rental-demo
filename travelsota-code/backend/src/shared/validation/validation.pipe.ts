import { ValidationPipe } from '@nestjs/common';
import { buildValidationException } from './validation-exception.factory';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    stopAtFirstError: false,
    exceptionFactory: buildValidationException,
  });
}
