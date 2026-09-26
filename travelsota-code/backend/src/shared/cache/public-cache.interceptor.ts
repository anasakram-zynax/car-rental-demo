import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

// ponytail: micro TTL cache for hot PUBLIC read-only endpoints (site-config,
// modules, currencies, languages, public CMS). These endpoints sit on the
// critical path of every page load (SSR + first client paint) and their data
// changes rarely — a 30s in-process cache turns repeat traffic into zero-DB
// responses, and the emitted Cache-Control lets the edge/nginx serve repeats
// without reaching the Node process at all.
//
// Use ONLY on anonymous, unauthenticated GET endpoints whose payload is safe
// to reuse across users (no per-user data). For per-admin dashboards use
// dashboard/api/ttl-cache.interceptor.ts (60s, no HTTP caching) instead.

const cache = new Map<string, { value: unknown; expires: number }>();
const TTL_MS = 30_000;

@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse<Response>();
    const key = `${req.method}:${req.originalUrl}`;

    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
      this.stampCacheControl(res);
      return of(hit.value);
    }

    return next.handle().pipe(
      map((value) => {
        cache.set(key, { value, expires: Date.now() + TTL_MS });
        // Opportunistically prune so the map cannot grow unbounded with
        // query-string variants (autocomplete q=... etc.).
        if (cache.size > 500) {
          const now = Date.now();
          for (const [k, v] of cache) {
            if (v.expires <= now) cache.delete(k);
          }
        }
        this.stampCacheControl(res);
        return value;
      }),
    );
  }

  private stampCacheControl(res: Response): void {
    if (!res?.headersSent) {
      res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=60');
    }
  }
}
