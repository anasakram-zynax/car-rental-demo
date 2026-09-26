import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';
import type { Cache } from 'cache-manager';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly upstashClient: UpstashRedis | null;
  private readonly ioredisClient: IORedis | null;
  private ioredisAvailable = true;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: AppConfigService,
  ) {
    const { upstashRestUrl, upstashRestToken, redisUrl } =
      this.configService.cache;

    this.upstashClient =
      upstashRestUrl && upstashRestToken
        ? new UpstashRedis({ url: upstashRestUrl, token: upstashRestToken })
        : null;

    if (this.upstashClient) {
      this.logger.log('Using Upstash REST client for cache');
      this.ioredisClient = null;
    } else if (redisUrl) {
      const client = new IORedis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 5000,
        enableOfflineQueue: false,
      });
      client.on('error', (err) => {
        this.logger.warn(
          `Redis cache connection error — marking unavailable: ${err.message}`,
        );
        this.ioredisAvailable = false;
      });
      client.on('end', () => {
        this.ioredisAvailable = false;
      });
      client.connect().catch((err) => {
        this.logger.warn(
          `Redis cache connect failed — falling back to in-memory: ${err.message}`,
        );
        this.ioredisAvailable = false;
      });
      this.ioredisClient = client;
      this.logger.log('Using Redis (ioredis) client for cache');
    } else {
      this.logger.log('No Redis configured — using in-memory cache manager');
      this.ioredisClient = null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.upstashClient) {
      try {
        const result = await this.withTimeout(
          this.upstashClient.get<T>(this.withPrefix(key)),
          5_000,
        );
        // Only return on an actual HIT — a null result means the key may have
        // been written to the in-memory fallback when Upstash set() failed
        // (e.g. payload too large, transient outage). Falling through keeps
        // both stores consistent.
        if (result != null) {
          return result;
        }
      } catch (err) {
        this.logger.warn(
          `Upstash get failed (${(err as Error).message}) — falling back to in-memory`,
        );
      }
    }

    if (
      this.ioredisClient &&
      this.ioredisAvailable &&
      this.ioredisClient.status === 'ready'
    ) {
      try {
        const raw = await this.withTimeout(
          this.ioredisClient.get(this.withPrefix(key)),
          5_000,
        );
        if (raw != null) {
          return JSON.parse(raw) as T;
        }
        // null → fall through to in-memory (see Upstash branch above)
      } catch {
        this.ioredisAvailable = false;
      }
    }

    try {
      const result = await this.withTimeout(
        this.cacheManager.get<T>(this.withPrefix(key)),
        2_000,
      );
      return result ?? null;
    } catch {
      // cache-manager store (redis-yet) hung — fail open, never block callers
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (this.upstashClient) {
      try {
        const ttl = ttlSeconds ?? this.configService.cache.defaultTtlSeconds;
        await this.withTimeout(
          this.upstashClient.set(this.withPrefix(key), value, { ex: ttl }),
          5_000,
        );
        return;
      } catch (err) {
        this.logger.warn(
          `Upstash set failed (${(err as Error).message}) — falling back to in-memory`,
        );
      }
    }

    if (
      this.ioredisClient &&
      this.ioredisAvailable &&
      this.ioredisClient.status === 'ready'
    ) {
      try {
        const ttl = ttlSeconds ?? this.configService.cache.defaultTtlSeconds;
        const serialized = JSON.stringify(value);
        if (ttl > 0) {
          await this.withTimeout(
            this.ioredisClient.setex(this.withPrefix(key), ttl, serialized),
            5_000,
          );
        } else {
          await this.withTimeout(
            this.ioredisClient.set(this.withPrefix(key), serialized),
            5_000,
          );
        }
        return;
      } catch {
        this.ioredisAvailable = false;
      }
    }

    const ttlMs =
      (ttlSeconds ?? this.configService.cache.defaultTtlSeconds) * 1000;
    try {
      await this.withTimeout(
        this.cacheManager.set(this.withPrefix(key), value, ttlMs),
        2_000,
      );
    } catch {
      // cache-manager store hung — fail open, caching is best-effort
    }
  }

  async del(key: string): Promise<void> {
    if (this.upstashClient) {
      try {
        await this.withTimeout(
          this.upstashClient.del(this.withPrefix(key)),
          5_000,
        );
        return;
      } catch {
        // fall through to in-memory
      }
    }

    if (
      this.ioredisClient &&
      this.ioredisAvailable &&
      this.ioredisClient.status === 'ready'
    ) {
      try {
        await this.withTimeout(
          this.ioredisClient.del(this.withPrefix(key)),
          5_000,
        );
        return;
      } catch {
        this.ioredisAvailable = false;
      }
    }

    try {
      await this.withTimeout(
        this.cacheManager.del(this.withPrefix(key)),
        2_000,
      );
    } catch {
      // fail open
    }
  }

  async reset(): Promise<void> {
    if (this.upstashClient || this.ioredisClient) {
      return;
    }

    const manager = this.cacheManager as unknown as {
      reset?: () => Promise<void>;
    };
    await manager.reset?.();
  }

  private withPrefix(key: string): string {
    return `${this.configService.cache.keyPrefix}${key}`;
  }

  /** Hard timeout so a hung Redis/Upstash connection can never block requests. */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Cache operation timed out after ${ms}ms`)),
          ms,
        ),
      ),
    ]);
  }
}
