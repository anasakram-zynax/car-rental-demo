import { HttpException, HttpStatus } from '@nestjs/common';
import { getErrorDefinition, type ErrorCode } from './error-codes';

export class BusinessError extends HttpException {
  constructor(
    code: string | ErrorCode,
    message?: string,
    status?: HttpStatus,
    details?: Record<string, unknown>,
  ) {
    const def = getErrorDefinition(code);
    super(
      {
        code,
        message: message ?? def?.defaultMessage ?? 'An error occurred.',
        ...(details ? { details } : {}),
      },
      status ?? def?.httpStatus ?? HttpStatus.BAD_REQUEST,
    );
  }
}
