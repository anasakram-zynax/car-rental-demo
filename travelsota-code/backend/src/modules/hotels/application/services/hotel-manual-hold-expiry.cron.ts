import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';
import { isManualPaymentGateway } from '../../../payment/domain/enums/payment-gateway.enum';
import { SiteSettingStore } from '../../../settings/infrastructure/site-setting.store';

/**
 * Hotels have no supplier hold, so a Bank Transfer / Pay Later booking would
 * wait forever. Expire unpaid manual hotel bookings once the admin pay-later
 * window (payLaterWindowMinutes, default 60) has passed since the payment row
 * was created. Nothing is held at the supplier, so only our rows change.
 */
@Injectable()
export class HotelManualHoldExpiryCron {
  private readonly logger = new Logger(HotelManualHoldExpiryCron.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRepository: PaymentRepository,
    private readonly siteSettings: SiteSettingStore,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStaleManualHolds(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const windowMinutes =
        (await this.siteSettings.get<number>('payLaterWindowMinutes').catch(() => null)) ?? 60;
      const cutoff = new Date(Date.now() - windowMinutes * 60_000);
      const stale = await this.prisma.payment.findMany({
        where: {
          bookingType: 'HOTEL',
          status: 'PENDING',
          gateway: { in: ['BANK_TRANSFER', 'PAY_LATER'] },
          createdAt: { lt: cutoff },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const p of stale) await this.expireOne(p.bookingId);
    } catch (e: unknown) {
      this.logger.error(`[HotelManualHoldExpiry] run failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async expireOne(bookingId: string): Promise<void> {
    try {
      const booking = await this.prisma.hotelBooking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      // Only untouched bookings — never expire something already issued/settled.
      if (!booking || booking.status !== 'pending_payment') {
        return;
      }
      const payments = await this.paymentRepository.findMany({ bookingId });
      for (const payment of payments) {
        if (payment.status === PaymentStatus.PENDING && isManualPaymentGateway(String(payment.gateway))) {
          payment.status = PaymentStatus.CANCELLED;
          payment.updatedAt = new Date();
          await this.paymentRepository.update(payment);
        }
      }
      await this.prisma.hotelBooking.update({
        where: { id: bookingId },
        data: { status: 'hold_expired', message: 'Payment window expired.' } as any,
      });
      this.logger.log(`[HotelManualHoldExpiry] Expired hotel booking ${bookingId}`);
    } catch (e: unknown) {
      this.logger.error(`[HotelManualHoldExpiry] ${bookingId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
