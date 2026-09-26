import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommissionService } from './commission.service';
import { AgentCommissionController } from './agent-commission.controller';
import { AdminCommissionController } from './admin-commission.controller';
import { EventDispatcherService } from '../../shared/outbox/application/event-dispatcher.service';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [PrismaModule, AccessControlModule, WalletModule, CurrencyModule, NotificationsModule],
  controllers: [AgentCommissionController, AdminCommissionController],
  providers: [CommissionService],
  exports: [CommissionService],
})
export class CommissionModule implements OnModuleInit {
  private readonly logger = new Logger(CommissionModule.name);

  constructor(
    private readonly commissionService: CommissionService,
    private readonly dispatcher: EventDispatcherService,
  ) {}

  onModuleInit(): void {
    this.dispatcher.register('COMMISSION_CALC', async (event) => {
      const { bookingId, bookingType, agentProfileId, bookingAmount } = event.payload as any;
      this.logger.log(`Processing COMMISSION_CALC for booking ${bookingId}`);
      await this.commissionService.calculateCommission({
        bookingId,
        bookingType: bookingType ?? 'flight',
        agentProfileId,
        bookingAmount: bookingAmount ?? 0,
      });
    });

    this.dispatcher.register('BOOKING_CANCELLED', async (event) => {
      const { bookingId } = event.payload as any;
      this.logger.log(`Processing BOOKING_CANCELLED for booking ${bookingId} — reverting commission`);
      await this.commissionService.revertOnCancellation(bookingId);
    });

    this.logger.log('CommissionModule initialized — event handlers registered');
  }
}
