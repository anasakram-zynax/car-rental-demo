import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { DemoSessionService } from '../application/demo-session.service';

const SESSION_HEADER = 'x-demo-session-id';

/**
 * Records which API endpoints a demo visitor's browser calls while their
 * session is live. The frontend client stamps every request with
 * `x-demo-session-id`; requests without it (admins, public visitors) are
 * skipped in O(1). The service throttles to one row per (session, method,
 * path) per minute, so this stays near-free even under load. The session
 * itself lives in the body, so the header never leaks anything sensitive.
 *
 * Registered globally via APP_INTERCEPTOR in DemoLeadsModule.
 */
@Injectable()
export class DemoActivityInterceptor implements NestInterceptor {
  constructor(private readonly demoSessions: DemoSessionService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType<string>() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const sessionId = req.headers[SESSION_HEADER];

    // Only demo browsers stamp this header; skip everything else cheaply.
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          // 4xx/5xx noise (e.g. expired refreshes) is not "activity".
          if (res.statusCode >= 400) return;
          void this.demoSessions
            .recordApiActivity(sessionId, req.method, req.path ?? req.url)
            .catch(() => undefined);
        },
      }),
    );
  }
}
