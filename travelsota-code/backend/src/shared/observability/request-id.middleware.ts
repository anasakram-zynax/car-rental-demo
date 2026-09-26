import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incomingRequestId = request.header('x-request-id');
  const requestId = incomingRequestId?.trim() || randomUUID();

  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
