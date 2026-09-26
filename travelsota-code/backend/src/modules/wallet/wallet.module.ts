import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaModule } from '../../shared/database/prisma.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { PaymentsModule } from '../payment/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationService } from '../notifications/application/notification.service';
import { OutboxWriterService } from '../../shared/outbox/application/outbox-writer.service';
import { EventDispatcherService } from '../../shared/outbox/application/event-dispatcher.service';
import { WalletService } from './wallet.service';
import { CreditService } from './credit.service';
import { CustomerWalletService } from './customer-wallet.service';
import { AgentWalletController } from './agent-wallet.controller';
import { AdminWalletController } from './admin-wallet.controller';
import { CustomerWalletController } from './customer-wallet.controller';
import { AdminCustomerWalletController } from './admin-customer-wallet.controller';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [PrismaModule, AccessControlModule, PaymentsModule, NotificationsModule, CurrencyModule],
  controllers: [AgentWalletController, AdminWalletController, CustomerWalletController, AdminCustomerWalletController],
  providers: [WalletService, CreditService, CustomerWalletService],
  exports: [WalletService, CreditService, CustomerWalletService],
})
export class WalletModule implements OnModuleInit {
  private readonly logger = new Logger(WalletModule.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly customerWalletService: CustomerWalletService,
    private readonly dispatcher: EventDispatcherService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    this.onModuleInitTopups();
    this.onModuleInitCustomerFinalizer();
  }

  private async emitTopupCompleted(payload: Record<string, unknown>): Promise<void> {
    // Live admin notification for online top-ups — same eventId both paths.
    const eventId = randomUUID();
    await this.outboxWriter.writeSafe({
      eventType: 'wallet.topup.completed',
      aggregateType: (payload.owner as string) === 'agent' ? 'AgentWallet' : 'CustomerWallet',
      aggregateId: (payload.bookingId as string) ?? (payload.paymentId as string),
      idempotencyKey: eventId,
      payload,
    });
    await this.notifications.notifyDirect({
      eventType: 'wallet.topup.completed',
      aggregateType: (payload.owner as string) === 'agent' ? 'AgentWallet' : 'CustomerWallet',
      aggregateId: (payload.bookingId as string) ?? (payload.paymentId as string),
      idempotencyKey: eventId,
      payload,
    });
  }

  private onModuleInitCustomerFinalizer(): void {
    // booking.supplier_confirmed: deduct customer wallet AFTER supplier
    // success. Agent bookings are owned by the agent finalizer (which skips
    // non-agents); this skips non-customers. No commission for customers.
    this.dispatcher.register('booking.supplier_confirmed', async (event) => {
      const payload = event.payload as { bookingId: string };
      if (!payload?.bookingId) return;
      try {
        await this.customerWalletService.finalizeSupplierConfirmedBooking(payload.bookingId);
      } catch (error: any) {
        this.logger.error(
          `Customer booking finalization failed for booking ${payload.bookingId}: ${error?.message ?? error}`,
        );
        // Don't rethrow — booking already confirmed with supplier.
        // Pending hold expires via cron or manual review.
      }
    });

    this.logger.log('WalletModule initialized — booking.supplier_confirmed handler registered for customer wallets');
  }

  private onModuleInitTopups(): void {
    this.dispatcher.register('payment.succeeded', async (event) => {
      const payload = event.payload as any;
      if (payload?.bookingType !== 'WALLET_TOPUP') return;

      // Customer top-ups: bookingId format ctopup-{userId}-{timestamp}
      if (payload.bookingId?.startsWith('ctopup_')) {
        const userId = payload.bookingId.split('_')[1];
        if (!userId) {
          this.logger.warn(`Cannot process customer top-up: invalid bookingId format ${payload.bookingId}`);
          return;
        }
        try {
          await this.customerWalletService.deposit(
            userId,
            payload.amount,
            payload.paymentId,
            `Wallet top-up via ${payload.gateway || 'payment gateway'}`,
            undefined,
            `ctopup:${payload.paymentId ?? payload.bookingId}`,
            payload.currency ?? undefined,
          );
          this.logger.log(`Customer wallet top-up deposited ${payload.amount} to user ${userId}`);
          this.emitTopupCompleted({
            owner: 'customer',
            userId,
            amount: payload.amount,
            currency: payload.currency ?? 'USD',
            gateway: payload.gateway,
            paymentId: payload.paymentId,
            bookingId: payload.bookingId,
          }).catch(() => {});
        } catch (err: any) {
          this.logger.error(`Customer top-up deposit failed for user ${userId}: ${err.message}`);
        }
        return;
      }
      // bookingId format: topup-{agentProfileId}-{timestamp}
      const agentProfileId = payload.bookingId?.startsWith('topup_')
        ? payload.bookingId.split('_')[1]
        : null;

      if (!agentProfileId) {
        this.logger.warn(`Cannot process top-up: invalid bookingId format ${payload.bookingId}`);
        return;
      }

      try {
        await this.walletService.deposit(
          agentProfileId,
          payload.amount,
          payload.paymentId,
          `Wallet top-up via ${payload.gateway || 'payment gateway'}`,
          undefined,
          `topup:${payload.paymentId ?? payload.bookingId}`,
          payload.currency ?? undefined,
        );
        this.logger.log(`Wallet top-up deposited ${payload.amount} to agent ${agentProfileId}`);
        this.emitTopupCompleted({
          owner: 'agent',
          agentProfileId,
          amount: payload.amount,
          currency: payload.currency ?? 'USD',
          gateway: payload.gateway,
          paymentId: payload.paymentId,
          bookingId: payload.bookingId,
        }).catch(() => {});
      } catch (err: any) {
        this.logger.error(`Top-up deposit failed for agent ${agentProfileId}: ${err.message}`);
      }
    });

    this.logger.log('WalletModule initialized — payment.succeeded handler registered for top-ups');
  }
}
