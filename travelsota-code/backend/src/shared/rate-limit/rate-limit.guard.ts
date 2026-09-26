import { createHash } from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { CacheService } from '../cache/cache.service';
import {
  RATE_LIMIT_TIER_KEY,
  type RateLimitTier,
  type RateLimitTierOptions,
} from './rate-limit-tier.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  /**
   * In-memory fallback when Redis is unavailable.
   * Each tier has its own bucket map.
   */
  private readonly fallbackBuckets = new Map<string, Map<string, { count: number; resetAtMs: number }>>();
  private cleanupCycles = 0;

  constructor(
    private readonly configService: AppConfigService,
    private readonly cacheService: CacheService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();

    const endpointOptions = this.reflector.getAllAndOverride<RateLimitTierOptions | undefined>(
      RATE_LIMIT_TIER_KEY,
      [context.getHandler(), context.getClass()],
    );

    const tier = this.resolveTier(request, endpointOptions);
    const key = this.buildKey(request);
    const diagnostics = (request.securityDiagnostics ??= {});
    diagnostics.rateLimitTier = tier;
    diagnostics.rateLimitKeyHash = createHash('sha256').update(key).digest('hex').slice(0, 16);

    let ttlMs = this.configService.rateLimit.tiers[tier]?.ttlMs ?? this.configService.rateLimit.ttlMs;
    let limit = this.configService.rateLimit.tiers[tier]?.limit ?? this.configService.rateLimit.limit;

    if (endpointOptions?.ttlMs !== undefined) {
      ttlMs = endpointOptions.ttlMs;
    }
    if (endpointOptions?.limit !== undefined) {
      limit = endpointOptions.limit;
    }

    // Try Redis first (distributed, survives restarts)
    try {
      const result = await this.checkRedisRateLimit(key, tier, limit, ttlMs, now);
      diagnostics.rateLimitRemaining = result.remaining;
      diagnostics.rateLimitResetAt = new Date(result.resetAtMs).toISOString();
      return true;
    } catch (err) {
      if (err instanceof HttpException) {
        diagnostics.rateLimitExceeded = true;
        diagnostics.rateLimitRemaining = 0;
        diagnostics.rateLimitResetAt = new Date(now + ttlMs).toISOString();
        throw err;
      }
      // Redis unavailable — fall back to in-memory
    }

    // In-memory fallback
    try {
      const allowed = this.checkInMemoryRateLimit(key, tier, limit, ttlMs, now);
      const bucket = this.fallbackBuckets.get(tier)?.get(key);
      diagnostics.rateLimitRemaining = bucket ? Math.max(0, limit - bucket.count) : Math.max(0, limit - 1);
      diagnostics.rateLimitResetAt = bucket
        ? new Date(bucket.resetAtMs).toISOString()
        : new Date(now + ttlMs).toISOString();
      return allowed;
    } catch (err) {
      if (err instanceof HttpException) {
        diagnostics.rateLimitExceeded = true;
        diagnostics.rateLimitRemaining = 0;
        throw err;
      }
      throw err;
    }
  }

  private async checkRedisRateLimit(
    key: string,
    tier: RateLimitTier,
    limit: number,
    ttlMs: number,
    now: number,
  ): Promise<{ remaining: number; resetAtMs: number }> {
    const redisKey = `ratelimit:${tier}:${key}`;
    const ttlSeconds = Math.ceil(ttlMs / 1000);

    const current = await this.cacheService.get<number>(redisKey);

    if (current === null) {
      // First request — set initial count
      await this.cacheService.set(redisKey, 1, ttlSeconds);
      return { remaining: Math.max(0, limit - 1), resetAtMs: now + ttlMs };
    }

    if (current >= limit) {
      throw new HttpException(
        {
          message: `Rate limit exceeded. Try again later.`,
          code: 'RATE_LIMIT_EXCEEDED',
          limit,
          tier,
          windowMs: ttlMs,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.cacheService.set(redisKey, current + 1, ttlSeconds);
    return { remaining: Math.max(0, limit - current - 1), resetAtMs: now + ttlMs };
  }

  private checkInMemoryRateLimit(
    key: string,
    tier: RateLimitTier,
    limit: number,
    ttlMs: number,
    now: number,
  ): boolean {
    const tierBuckets = this.getOrCreateTierBuckets(tier);
    this.cleanupExpiredBuckets(now);

    const currentBucket = tierBuckets.get(key);

    if (!currentBucket || currentBucket.resetAtMs <= now) {
      tierBuckets.set(key, {
        count: 1,
        resetAtMs: now + ttlMs,
      });
      return true;
    }

    if (currentBucket.count >= limit) {
      const retryAfterMs = currentBucket.resetAtMs - now;
      throw new HttpException(
        {
          message: `Rate limit exceeded. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfterMs,
          limit,
          tier,
          windowMs: ttlMs,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    currentBucket.count += 1;
    tierBuckets.set(key, currentBucket);
    return true;
  }

  private resolveTier(request: Request, options?: RateLimitTierOptions): RateLimitTier {
    if (options?.tier) {
      return options.tier;
    }

    const user = (request as unknown as Record<string, unknown>).user as
      | { userType?: string; role?: string }
      | undefined;

    if (!user) {
      return 'anonymous';
    }

    switch (user.userType) {
      case 'STAFF':
        return 'staff';
      case 'AGENT':
        return 'agent';
      case 'CUSTOMER':
        return 'customer';
      default:
        return 'anonymous';
    }
  }

  private buildKey(request: Request): string {
    const routePath = request.path;
    const ipAddress =
      request.ip ||
      request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      request.socket.remoteAddress ||
      'unknown';

    return `${ipAddress}:${routePath}`;
  }

  private getOrCreateTierBuckets(tier: RateLimitTier): Map<string, { count: number; resetAtMs: number }> {
    let buckets = this.fallbackBuckets.get(tier);
    if (!buckets) {
      buckets = new Map();
      this.fallbackBuckets.set(tier, buckets);
    }
    return buckets;
  }

  private cleanupExpiredBuckets(now: number): void {
    this.cleanupCycles += 1;

    if (this.cleanupCycles % 100 !== 0) {
      let totalBuckets = 0;
      for (const buckets of this.fallbackBuckets.values()) {
        totalBuckets += buckets.size;
      }
      if (totalBuckets < 5000) {
        return;
      }
    }

    for (const [, buckets] of this.fallbackBuckets.entries()) {
      for (const [key, bucket] of buckets.entries()) {
        if (bucket.resetAtMs <= now) {
          buckets.delete(key);
        }
      }
    }
  }
}