import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';

/**
 * Dead-letter recovery cron for flight bookings.
 *
 * Runs every 5 minutes and handles two recovery scenarios:
 *
 * 1. **Stuck ticketing** — PAID flight payments whose bookings are still in
 *    `pending_payment` or `held` (ticketing never ran). Re-emits
 *    `payment.succeeded` so the listener retries.
 *
 * 2. **Missing invoice/voucher** — ticketed/held bookings that have no live
 *    `booking.supplier_confirmed` outbox event (it was dead-lettered or never
 *    emitted). Re-emits `booking.supplier_confirmed` so the DocumentsModule
 *    regenerates the invoice and voucher.
 *
 * Safety net for: connection pool exhaustion, transient provider failures,
 * or process crashes that prevent the outbox relay from completing.
 */
@Injectable()
export class FlightDeadLetterRecoveryCron {
  private readonly logger = new Logger(FlightDeadLetterRecoveryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  /**
   * TEMPORARILY DISABLED — re-emitting events was exhausting the DB
   * connection pool and blocking the outbox relay from claiming new
   * payment.succeeded events. Will re-enable after verifying the root
   * cause of Travelport booking failures.
   *
   * To re-enable: remove the early return below and add the
   * ENABLE_FLIGHT_RECOVERY_WORKER guard + advisory lock.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async recoverStuckBookings(): Promise<void> {
    if (process.env.ENABLE_FLIGHT_RECOVERY_WORKER !== 'true') return;
    // Intentionally disabled — see comment above
    return;
  }

  /**
   * Scenario 1: PAID flight payments whose bookings are stuck in
   * `pending_payment` or `held` — ticketing never ran or the
   * `payment.succeeded` event was dead-lettered.
   */
  private async recoverPendingTicketing(): Promise<void> {
    try {
      const stuckPayments = await this.prisma.$queryRawUnsafe<
        { paymentId: string; bookingId: string; amount: number; currency: string; bookingType: string }[]
      >(
        `SELECT p.id AS "paymentId", p."bookingId", p.amount, p.currency, p."bookingType"
         FROM "Payment" p
         JOIN "FlightBooking" fb ON fb.id = p."bookingId"
         WHERE p.status = 'PAID'
           AND p."bookingType" = 'FLIGHT'
           AND fb.status IN ('pending_payment', 'held')
           AND fb."updatedAt" < NOW() - INTERVAL '2 minutes'
          ORDER BY fb."updatedAt" ASC
          LIMIT 5`,
      );

      if (stuckPayments.length === 0) return;

      this.logger.warn(
        `[DeadLetterRecovery] Found ${stuckPayments.length} stuck booking(s) with PAID payment`,
      );

      let recovered = 0;
      for (const payment of stuckPayments) {
        const existingEvent = await this.prisma.outboxEvent.findFirst({
          where: {
            eventType: 'payment.succeeded',
            aggregateId: payment.paymentId,
            status: { not: 'dead_letter' },
          },
          select: { id: true },
        });

        if (existingEvent) continue;

        await this.outboxWriter.write({
          eventType: 'payment.succeeded',
          aggregateType: 'payment',
          aggregateId: payment.paymentId,
          payload: {
            paymentId: payment.paymentId,
            bookingId: payment.bookingId,
            bookingType: payment.bookingType,
            amount: payment.amount,
            currency: payment.currency,
          },
        });

        this.logger.log(
          `[DeadLetterRecovery] Re-emitted payment.succeeded for booking ${payment.bookingId.slice(0, 8)}... (payment ${payment.paymentId.slice(0, 8)}...)`,
        );
        recovered++;

        // Throttle to avoid connection pool exhaustion
        await new Promise((r) => setTimeout(r, 500));
      }

      if (recovered > 0) {
        this.logger.log(
          `[DeadLetterRecovery] Recovered ${recovered} stuck booking(s) from pending ticketing`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[DeadLetterRecovery] Pending ticketing recovery failed: ${msg}`);
    }
  }

  /**
   * Scenario 2: ticketed/held bookings that have no live
   * `booking.supplier_confirmed` outbox event — the event was dead-lettered
   * (e.g. voucher or invoice generation failed due to transient DB error) or
   * never emitted. Re-emits so DocumentsModule regenerates voucher + invoice.
   */
  private async recoverMissingSupplierConfirmed(): Promise<void> {
    try {
      // Find ticketed/held flight bookings without a live booking.supplier_confirmed event
      const missingBookings = await this.prisma.$queryRawUnsafe<
        { bookingId: string; status: string; locatorCode: string | null }[]
      >(
        `SELECT fb.id AS "bookingId", fb.status, fb."locatorCode"
         FROM "FlightBooking" fb
         WHERE fb.status IN ('ticketed', 'held')
           AND fb."updatedAt" < NOW() - INTERVAL '2 minutes'
           AND fb."locatorCode" IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM "OutboxEvent" oe
             WHERE oe."aggregateId" = fb.id
               AND oe."eventType" = 'booking.supplier_confirmed'
               AND oe.status NOT IN ('dead_letter')
           )
          ORDER BY fb."updatedAt" ASC
          LIMIT 5`,
      );

      if (missingBookings.length === 0) return;

      this.logger.warn(
        `[DeadLetterRecovery] Found ${missingBookings.length} ticketed/held booking(s) missing booking.supplier_confirmed`,
      );

      let recovered = 0;
      for (const booking of missingBookings) {
        // Deduplicate: skip if we already re-emitted for this booking recently
        const recentEmit = await this.prisma.outboxEvent.findFirst({
          where: {
            eventType: 'booking.supplier_confirmed',
            aggregateId: booking.bookingId,
            createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
          },
          select: { id: true },
        });

        if (recentEmit) continue;

        await this.outboxWriter.write({
          eventType: 'booking.supplier_confirmed',
          aggregateType: 'Booking',
          aggregateId: booking.bookingId,
          payload: {
            bookingId: booking.bookingId,
            bookingType: 'FLIGHT',
            locatorCode: booking.locatorCode,
          },
        });

        this.logger.log(
          `[DeadLetterRecovery] Re-emitted booking.supplier_confirmed for booking ${booking.bookingId.slice(0, 8)}... (status: ${booking.status})`,
        );
        recovered++;

        // Throttle to avoid connection pool exhaustion
        await new Promise((r) => setTimeout(r, 500));
      }

      if (recovered > 0) {
        this.logger.log(
          `[DeadLetterRecovery] Recovered ${recovered} booking(s) missing supplier confirmation`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[DeadLetterRecovery] Missing supplier confirmed recovery failed: ${msg}`);
    }
  }
}
