import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { tap } from 'rxjs/operators';
import { LoggingConfig } from '../logging/logging.config';

const POLLING_PATHS = [
  '/api/v1/admin/notifications/events',
  '/api/v1/search-jobs/',
  '/api/v1/flights/bookings/',
  '/api/v1/hotels/bookings/',
];

function isPollingRoute(path: string): boolean {
  return POLLING_PATHS.some((p) => path.includes(p));
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startedAt = Date.now();
    const path = request.originalUrl ?? request.url;

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startedAt;

          if (isPollingRoute(path) && response.statusCode < 400) {
            return;
          }

          const slowMs = LoggingConfig.getSlowRequestMs();
          const verySlowMs = LoggingConfig.getVerySlowRequestMs();

          if (duration > verySlowMs) {
            this.logger.warn(
              `[SLOW] ${request.method} ${path} ${response.statusCode} ${duration}ms requestId=${request.requestId ?? 'n/a'}`,
            );
          } else if (duration > slowMs) {
            this.logger.warn(
              `[SLOW] ${request.method} ${path} ${response.statusCode} ${duration}ms requestId=${request.requestId ?? 'n/a'}`,
            );
          } else {
            this.logger.log(
              `${request.method} ${path} ${response.statusCode} ${duration}ms requestId=${request.requestId ?? 'n/a'}`,
            );
          }
        },
        error: () => {
          const duration = Date.now() - startedAt;
          this.logger.warn(
            `${request.method} ${path} ${response.statusCode} ${duration}ms requestId=${request.requestId ?? 'n/a'}`,
          );
        },
      }),
    );
  }
}
