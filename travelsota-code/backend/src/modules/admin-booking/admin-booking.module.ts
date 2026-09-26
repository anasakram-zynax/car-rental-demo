import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { AgentBookingModule } from '../agent-booking/agent-booking.module';
import { RefundModule } from '../refund/refund.module';
import { FlightsModule } from '../flights/flights.module';
import { HotelsModule } from '../hotels/hotels.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payment/payments.module';
import { OutboxModule } from '../../shared/outbox/outbox.module';
import { AdminBookingService } from './admin-booking.service';
import { AdminBookingController } from './admin-booking.controller';

@Module({
  imports: [
    PrismaModule,
    AccessControlModule,
    AgentBookingModule,
    RefundModule,
    FlightsModule,
    HotelsModule,
    NotificationsModule,
    PaymentsModule,
    OutboxModule,
  ],
  controllers: [AdminBookingController],
  providers: [AdminBookingService],
  exports: [AdminBookingService],
})
export class AdminBookingModule {}
