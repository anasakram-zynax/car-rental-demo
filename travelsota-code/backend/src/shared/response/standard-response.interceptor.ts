import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, switchMap } from 'rxjs';
import {
  RESPONSE_MESSAGE_KEY,
} from './response-message.decorator';

interface StandardSuccessResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  timestamp: string;
  path: string;
  requestId: string | null;
  data: T;
}

@Injectable()
export class StandardResponseInterceptor<T> implements NestInterceptor<
  T,
  StandardSuccessResponse<unknown> | undefined
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardSuccessResponse<unknown> | undefined> {
    if (context.getType() !== 'http') {
      return next.handle() as Observable<StandardSuccessResponse<unknown> | undefined>;
    }

    // Skip SSE endpoints — SSE responses must be raw EventSource format,
    // not wrapped in the standard { success, data } envelope.
    const req = context.switchToHttp().getRequest();
    if (req.path?.includes('/events')) {
      return next.handle() as Observable<StandardSuccessResponse<unknown> | undefined>;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const explicitMessage = this.reflector.getAllAndOverride<string>(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      switchMap((data) => {
        // 204 No Content — skip body wrapping per HTTP spec (RFC 7231 §6.3.5)
        if (response.statusCode === HttpStatus.NO_CONTENT) {
          return of(undefined);
        }
        const extracted = this.extractMessageAndPayload(data);
        return of({
          success: true,
          statusCode: response.statusCode,
          message:
            explicitMessage ??
            extracted.message ??
            'Request completed successfully.',
          timestamp: new Date().toISOString(),
          path: request.originalUrl ?? request.url,
          requestId: request.requestId ?? null,
          data: extracted.payload,
        } as const);
      }),
    );
  }

  private extractMessageAndPayload(data: unknown): {
    message?: string;
    payload: unknown;
  } {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { payload: data };
    }

    const record = data as Record<string, unknown>;
    const message =
      typeof record.message === 'string' ? record.message : undefined;

    if (!message) {
      return { payload: data };
    }

    const { message: _ignored, ...rest } = record;
    const hasOtherProperties = Object.keys(rest).length > 0;

    return {
      message,
      payload: hasOtherProperties ? rest : data,
    };
  }
}
