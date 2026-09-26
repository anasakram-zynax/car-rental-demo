import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';
import { PaymentOrchestratorService } from '../../../payment/application/services/payment-orchestrator.service';
import { isManualPaymentGateway } from '../../../payment/domain/enums/payment-gateway.enum';
import { NotificationService } from '../../../notifications/application/notification.service';
import { randomUUID } from 'node:crypto';
import { FlightBookingProviderRegistryService } from './flight-booking-provider-registry.service';
import type { FlightsProviderKey } from '../../../settings/domain/provider-config.entity';

@Injectable()
export class FlightHoldExpiryCron {
  private readonly logger = new Logger(FlightHoldExpiryCron.name);
  private isRunning = false;

  /**
   * Channel routing for Travelport cancels (same precedence as
   * FlightBookingPublicService.resolveTravelportChannel): snapshot top
   * level -> selectedOfferContext. Snapshot may come back as a string
   * from the raw query — parsed defensively.
   */
  private resolveTravelportChannel(offerSnapshot: unknown): {
    contentSource?: string;
    offerIdentifier?: string;
  } {
    let snapshot: Record<string, unknown> | undefined;
    if (typeof offerSnapshot === 'string') {
      try {
        snapshot = JSON.parse(offerSnapshot) as Record<string, unknown>;
      } catch {
        snapshot = undefined;
      }
    } else if (offerSnapshot && typeof offerSnapshot === 'object') {
      snapshot = offerSnapshot as Record<string, unknown>;
    }
    const snapshotCtx = snapshot?.selectedOfferContext as
      | Record<string, unknown>
      | undefined;
    const offeringIds = snapshotCtx?.offeringIds;
    return {
      contentSource:
        (snapshot?.contentSource as string | undefined) ??
        (snapshotCtx?.contentSource as string | undefined),
      offerIdentifier:
        (snapshot?.offerIdentifier as string | undefined) ??
        (Array.isArray(offeringIds)
          ? (offeringIds as string[])[0]
          : undefined),
    };
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRepository: PaymentRepository,
    private readonly paymentOrchestrator: PaymentOrchestratorService,
    private readonly notifications: NotificationService,
    private readonly bookingProviderRegistry: FlightBookingProviderRegistryService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStaleHolds(): Promise<void> {
    if (process.env.ENABLE_FLIGHT_HOLD_EXPIRY_CRON === 'false') return;

    if (this.isRunning) {
      this.logger.warn('[HoldExpiry] Previous run still in progress — skipping');
      return;
    }

    try {
      this.isRunning = true;
      const stale = await this.prisma.$queryRawUnsafe<
        { id: string; userId: string | null; provider: string; locatorCode: string | null; workbenchId: string | null; offerSnapshot: unknown }[]
      >(
        `SELECT fb.id, fb."userId", fb.provider, fb."locatorCode", fb."workbenchId", fb."offerSnapshot"
         FROM "FlightBooking" fb
          WHERE fb.status IN ('held_pending_payment', 'pending_payment')
            AND fb."holdExpiresAt" IS NOT NULL
           AND fb."holdExpiresAt" < NOW()
         ORDER BY fb."holdExpiresAt" ASC
         LIMIT 10`,
      );

      if (stale.length === 0) return;

      this.logger.log(
        `[HoldExpiry] Found ${stale.length} stale holds — expiring...`,
      );

      for (const booking of stale) {
        await this.expireOne(booking.id, booking.userId, booking.provider, booking.locatorCode, booking.workbenchId, booking.offerSnapshot);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`[HoldExpiry] Cron run failed: ${msg}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async expireOne(
    bookingId: string,
    userId: string | null,
    provider: string,
    locatorCode: string | null,
    workbenchId: string | null,
    offerSnapshot: unknown,
  ): Promise<void> {
    try {
      // Phase 8: Cancel held PNR via provider before marking expired
      if (locatorCode) {
        try {
          const providerAdapter = this.bookingProviderRegistry.getProvider(provider as FlightsProviderKey);
          if (providerAdapter.cancelBooking) {
            // Hard timeout — a hung provider call must never stall the cron.
            const cancelResult = await Promise.race([
              providerAdapter.cancelBooking({
                bookingId,
                supplierBookingId: workbenchId ?? undefined,
                locatorCode,
                // Channel routing: NDC holds must use canceloffer, not the
                // GDS cancelitems endpoint (provider defaults to GDS).
                ...this.resolveTravelportChannel(offerSnapshot),
              }),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error('Provider cancel timed out after 30s')),
                  30_000,
                ),
              ),
            ]);
            this.logger.log(
              `[HoldExpiry] Provider cancel result for ${bookingId}: ok=${cancelResult.ok}`,
            );
          }
        } catch (pErr: unknown) {
          const pMsg = pErr instanceof Error ? pErr.message : 'unknown error';
          this.logger.warn(
            `[HoldExpiry] Provider cancel failed for ${bookingId}: ${pMsg}`,
          );
        }
      }

      // Cancel any pending payment
      const payments = await this.paymentRepository.findMany({ bookingId });
      for (const payment of payments) {
        if (
          payment.status === PaymentStatus.PENDING ||
          payment.status === PaymentStatus.AUTHORIZED
        ) {
          try {
            // Manual methods have no gateway adapter (getGateway would throw).
            if (!isManualPaymentGateway(String(payment.gateway))) {
              const gateway =
                this.paymentOrchestrator.getGateway(payment.gateway);
              if (gateway.cancelPayment) {
                await gateway.cancelPayment(payment.providerPaymentId!);
              }
            }
            payment.status = PaymentStatus.CANCELLED;
            payment.updatedAt = new Date();
            await this.paymentRepository.update(payment);
          } catch (pErr: unknown) {
            const pMsg =
              pErr instanceof Error ? pErr.message : 'unknown error';
            this.logger.warn(
              `[HoldExpiry] Payment cancel failed for ${payment.id}: ${pMsg}`,
            );
          }
        }
      }

      // Mark booking as hold_expired
      await this.prisma.flightBooking.update({
        where: { id: bookingId },
        data: {
          status: 'hold_expired',
          message: 'Pre-payment hold expired.',
        },
      });

      this.notifications.notifyDirect({
        idempotencyKey: randomUUID(),
        eventType: 'booking.hold_expired',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: {
          bookingId,
          bookingType: 'FLIGHT',
          reason: 'Pre-payment hold TTL reached.',
        },
      }).catch(() => {});

      this.logger.log(
        `[HoldExpiry] Expired hold for booking ${bookingId}`,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `[HoldExpiry] Failed to expire hold for ${bookingId}: ${msg}`,
      );
    }
  }
}
