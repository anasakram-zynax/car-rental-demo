import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../shared/database/prisma.service';

/**
 * Reconciliation cron for flight bookings.
 *
 * Runs daily at 02:00 to detect orphaned `held` bookings — PNRs that were
 * held (created at Travelport) but never advanced to `ticketed` or `failed`.
 * These waste airline allocation slots and should be flagged for admin review.
 *
 * ponytail: minimal implementation — just logs orphans. Add auto-cleanup
 * (cancel PNR via Travelport API) when admin review queue exists.
 */
@Injectable()
export class FlightReconciliationCron {
  private readonly logger = new Logger(FlightReconciliationCron.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Daily at 02:00 — scan for orphaned held bookings older than 24 hours.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async reconcileOrphanedHeldBookings(): Promise<void> {
    if (process.env.ENABLE_FLIGHT_RECOVERY_WORKER !== 'true') return;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      const orphans = await this.prisma.flightBooking.findMany({
        where: {
          status: 'held',
          updatedAt: { lt: cutoff },
          // Fake (demo fallback) PNRs contain "/" and have no supplier
          // reservation to reconcile — don't flag them as orphaned holds.
          NOT: { locatorCode: { contains: '/' } },
        },
        select: {
          id: true,
          locatorCode: true,
          provider: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'asc' },
      });

      if (orphans.length === 0) {
        this.logger.log('[Reconciliation] No orphaned held bookings found');
        return;
      }

      this.logger.warn(
        `[Reconciliation] Found ${orphans.length} orphaned held booking(s) older than 24h:\n` +
          orphans
            .map(
              (o) =>
                `  id=${o.id.slice(0, 8)}... locator=${o.locatorCode ?? 'N/A'} provider=${o.provider} updated=${o.updatedAt.toISOString()}`,
            )
            .join('\n'),
      );

      // Mark them for admin review (update message but keep status)
      // ponytail: log-only for now. Add Travelport cancel API call when
      // admin review queue is integrated.
      for (const orphan of orphans) {
        await this.prisma.flightBooking.update({
          where: { id: orphan.id },
          data: {
            message: `RECONCILIATION_FLAG: Held PNR older than 24h (updated ${orphan.updatedAt.toISOString()}). Requires admin review.`,
          },
        });
      }

      this.logger.log(
        `[Reconciliation] Flagged ${orphans.length} orphaned held booking(s) for admin review`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Reconciliation] Failed to scan orphaned bookings: ${msg}`);
    }
  }
}
