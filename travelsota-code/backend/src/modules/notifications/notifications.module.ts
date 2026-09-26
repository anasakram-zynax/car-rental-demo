import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { OutboxModule } from '../../shared/outbox/outbox.module';
import { AdminNotificationsController } from './api/admin-notifications.controller';
import { NotificationGateway } from './api/notification.gateway';
import { NotificationService } from './application/notification.service';
import { NotificationRecipientResolverService } from './application/notification-recipient-resolver.service';
import { NotificationEventHandlerService } from './application/notification-event-handler.service';
import { NotificationRuleSeedService } from './application/notification-rule-seed.service';
import { PrismaNotificationRepository } from './infrastructure/prisma-notification.repository';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [PrismaModule, OutboxModule, CurrencyModule],
  controllers: [AdminNotificationsController],
  providers: [
    PrismaNotificationRepository,
    NotificationService,
    NotificationRecipientResolverService,
    NotificationEventHandlerService,
    NotificationGateway,
    NotificationRuleSeedService,
  ],
  exports: [
    NotificationService,
    NotificationGateway,
    PrismaNotificationRepository,
  ],
})
export class NotificationsModule {}
