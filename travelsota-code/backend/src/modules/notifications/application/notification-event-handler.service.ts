import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventDispatcherService } from '../../../shared/outbox/application/event-dispatcher.service';
import { NotificationService } from './notification.service';

/**
 * Registers notification handlers for outbox events.
 * Listens to all notification-related event types and creates notifications.
 */
@Injectable()
export class NotificationEventHandlerService implements OnModuleInit {
  private readonly logger = new Logger(NotificationEventHandlerService.name);

  // All event types that should generate notifications
  private readonly EVENT_TYPES = [
    'booking.flight.created',
    'booking.hotel.created',
    'booking.confirmed',
    'booking.failed',
    'booking.cancelled',
    'payment.succeeded',
    'payment.failed',
    'refund.requested',
    'refund.completed',
    'agent.credit.near_limit',
    'agent.credit.exceeded',
    'user.staff.created',
    'user.staff.deleted',
    'role.updated',
    'role.permission_changed',
    'settings.provider_credentials_updated',
    'settings.provider_toggled',
    'settings.payment_gateway_updated',
    'provider.travelport.failure',
    'provider.duffel.failure',
    'provider.hotelbeds.failure',
  ];

  constructor(
    private readonly eventDispatcher: EventDispatcherService,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit() {
    for (const eventType of this.EVENT_TYPES) {
      this.eventDispatcher.register(eventType, async (event) => {
        try {
          await this.notificationService.handleOutboxEvent({
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: event.payload as Record<string, unknown>,
            idempotencyKey: event.idempotencyKey,
          });
        } catch (err: unknown) {
          // Log with full stack trace — silently swallowing hides notification failures
          this.logger.error(
            `Notification handler failed for ${event.eventType} (${event.id}): ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      });
    }
    this.logger.log(
      `Registered ${this.EVENT_TYPES.length} notification event handlers`,
    );
  }
}