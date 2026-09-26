import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { CacheService } from '../../../shared/cache/cache.service';

/**
 * Shared TTL cache with stale-while-revalidate.
 *
 * Backed by CacheService (Upstash Redis when configured, in-memory
 * otherwise), so cached dashboard responses survive restarts and are shared
 * across instances — the old module-level Map went cold on every deploy.
 *
 * Within TTL: instant cached response, zero DB.
 * After TTL: the STALE value is returned immediately and a single background
 * refresh runs (stampede-guarded by a cooldown). The previous version served
 * nothing during an expired window, so every dashboard load after 60s idle
 * paid the full ~1-2s of remote-DB query latency again.
 *
 * Dashboard data is monitoring data — a few extra seconds of staleness is
 * fine; always-slow responses are not.
 */
interface CacheEntry {
  value: unknown;
  expires: number;
  refreshing?: boolean;
}

// Per-instance refresh guards (not shared — a duplicate background refresh
// across two instances is harmless and self-healing).
const refreshing = new Set<string>();
const TTL_MS = 60_000;
const SHARED_TTL_SECONDS = 300;
// Cooldown so a burst of requests during the stale window triggers ONE
// background refresh, not one per request.
const REFRESH_COOLDOWN_MS = 30_000;

@Injectable()
export class TtlCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: CacheService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const key = `ttl:${req.method}:${req.originalUrl}`;

    return from(this.cache.get<CacheEntry>(key)).pipe(
      switchMap((hit) => {
        const fresh = !!hit && hit.expires > Date.now();

        // Fresh → serve as-is. Stale with a value → serve stale + refresh
        // once in the background. No entry at all → fall through and await
        // the real handler (the first requester pays the cold cost and
        // warms the shared cache).
        if (hit && (fresh || (!refreshing.has(key) && hit.value !== undefined))) {
          if (!fresh) {
            refreshing.add(key);
            this.refreshInBackground(key, next);
          }
          return of(hit.value);
        }

        return next.handle().pipe(
          tap((value) => {
            void this.cache
              .set(key, { value, expires: Date.now() + TTL_MS }, SHARED_TTL_SECONDS)
              .catch(() => {});
          }),
        );
      }),
    );
  }

  private refreshInBackground(key: string, next: CallHandler): void {
    next.handle()
      .pipe(
        tap((value) => {
          void this.cache
            .set(key, { value, expires: Date.now() + TTL_MS }, SHARED_TTL_SECONDS)
            .catch(() => {});
        }),
      )
      .subscribe({
        // On error keep serving the stale value; the cooldown gates when the
        // next refresh attempt may happen instead of retry-thrashing.
        error: () => {
          // Keep the guard through the cooldown so error bursts don't
          // retry-thrash; stale value keeps serving meanwhile.
          setTimeout(() => refreshing.delete(key), REFRESH_COOLDOWN_MS).unref?.();
        },
        complete: () => {
          refreshing.delete(key);
        },
      });
  }
}
