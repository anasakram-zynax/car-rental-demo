import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const DEFAULT_LOCK_TTL_MS = 60_000; // 60 seconds

export interface WithLockOptions {
  /** Lock lease duration in ms. Auto-expires if process crashes. Default: 60s. */
  ttlMs?: number;
}

/**
 * Distributed lock using a Postgres WorkerLock table.
 * Safe with Prisma connection pooling — no session-based state.
 *
 * Usage:
 *   await this.lockService.withLock('email-dispatch', async () => {
 *     await this.dispatchAllPending(10);
 *   });
 *
 *   // Long-running hotel job with 5-minute lease:
 *   await this.lockService.withLock('hotel-canonical-backfill', async () => {
 *     await this.runBackfill();
 *   }, { ttlMs: 300_000 });
 */
@Injectable()
export class PostgresAdvisoryLockService {
  private readonly logger = new Logger(PostgresAdvisoryLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Try to acquire a named lock. If held by another process (and not expired),
   * skip execution. On success, run fn, then release the lock.
   */
  async withLock(
    lockKey: string,
    fn: () => Promise<void>,
    options?: WithLockOptions,
  ): Promise<void> {
    const ttlMs = options?.ttlMs ?? DEFAULT_LOCK_TTL_MS;
    const lockedBy = `${process.env.APP_ROLE ?? 'api'}-${process.pid}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    // Clean up expired locks for this key first
    await this.prisma.workerLock.deleteMany({
      where: { lockKey, expiresAt: { lt: now } },
    });

    // Try to acquire: INSERT only if no unexpired row exists
    const acquired = await this.tryAcquire(lockKey, lockedBy, expiresAt);
    if (!acquired) {
      return;
    }

    try {
      if (process.env.ENABLE_WORKER_DEBUG_LOGS === 'true') {
        this.logger.debug(`Lock "${lockKey}" acquired by ${lockedBy} (TTL ${ttlMs}ms)`);
      }
      await fn();
    } catch (err) {
      this.logger.error(
        `Lock "${lockKey}" error: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    } finally {
      // Release only if we still own it (didn't expire mid-execution)
      await this.release(lockKey, lockedBy);
    }
  }

  private async tryAcquire(
    lockKey: string,
    lockedBy: string,
    expiresAt: Date,
  ): Promise<boolean> {
    try {
      await this.prisma.workerLock.create({
        data: { lockKey, lockedBy, expiresAt },
      });
      return true;
    } catch {
      // Unique constraint violation → lock is held
      return false;
    }
  }

  private async release(lockKey: string, lockedBy: string): Promise<void> {
    try {
      await this.prisma.workerLock.deleteMany({
        where: { lockKey, lockedBy },
      });
      if (process.env.ENABLE_WORKER_DEBUG_LOGS === 'true') {
        this.logger.debug(`Lock "${lockKey}" released`);
      }
    } catch {
      // Non-fatal — lock will auto-expire via expiresAt
    }
  }
}
