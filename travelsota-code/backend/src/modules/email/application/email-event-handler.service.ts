import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventDispatcherService } from '../../../shared/outbox/application/event-dispatcher.service';
import { EmailService } from './email.service';
import { EmailDispatcherService } from './email-dispatcher.service';
import { EmailRecipientResolver } from './email-recipient-resolver.service';
import { EmailTemplateKey } from '../domain/email-template-key.enum';
import type { OutboxEventEntity } from '../../../shared/outbox/domain/outbox-event.entity';
import type { EmailRecipientInfo } from '../domain/email-event-types';

interface EventHandlerMapping {
  eventType: string;
  templateKey: string;
  resolveRecipients: (event: OutboxEventEntity) => Promise<EmailRecipientInfo[]>;
  resolveData: (event: OutboxEventEntity) => Record<string, unknown>;
  severity?: string;
}

@Injectable()
export class EmailEventHandlerService implements OnModuleInit {
  private readonly logger = new Logger(EmailEventHandlerService.name);

  constructor(
    private readonly dispatcher: EventDispatcherService,
    private readonly emailService: EmailService,
    private readonly emailDispatcher: EmailDispatcherService,
    private readonly recipientResolver: EmailRecipientResolver,
  ) {}

  onModuleInit() {
    this.registerHandlers();
    this.logger.log('Email event handlers registered');
  }

  private registerHandlers() {
    const self = this;

    const eventMap: EventHandlerMapping[] = [
      {
        eventType: 'booking.flight.created',
        templateKey: EmailTemplateKey.BOOKING_CREATED,
        resolveRecipients: (e) => {
          const { bookingId } = e.payload as Record<string, unknown>;
          return self.recipientResolver.resolveByRule('booking.flight.created', bookingId as string);
        },
        resolveData: (e) => self.buildBookingData(e, 'flight'),
      },
      {
        eventType: 'booking.hotel.created',
        templateKey: EmailTemplateKey.BOOKING_CREATED,
        resolveRecipients: (e) => {
          const { bookingId } = e.payload as Record<string, unknown>;
          return self.recipientResolver.resolveByRule('booking.hotel.created', bookingId as string);
        },
        resolveData: (e) => self.buildBookingData(e, 'hotel'),
      },
      {
        eventType: 'booking.confirmed',
        templateKey: EmailTemplateKey.BOOKING_CONFIRMED,
        resolveRecipients: (e) => {
          const { bookingId } = e.payload as Record<string, unknown>;
          return self.recipientResolver.resolveByRule('booking.confirmed', bookingId as string);
        },
        resolveData: (e) => self.buildBookingData(e),
      },
      {
        eventType: 'booking.failed',
        templateKey: EmailTemplateKey.BOOKING_FAILED,
        resolveRecipients: (e) => {
          const { bookingId } = e.payload as Record<string, unknown>;
          return self.recipientResolver.resolveByRule('booking.failed', bookingId as string);
        },
        resolveData: (e) => ({
          ...self.buildBookingData(e),
          reason: (e.payload as Record<string, unknown>)?.reason as string | undefined,
        }),
        severity: 'critical',
      },
      {
        eventType: 'booking.cancelled',
        templateKey: EmailTemplateKey.BOOKING_CANCELLED,
        resolveRecipients: (e) => {
          const { bookingId } = e.payload as Record<string, unknown>;
          return self.recipientResolver.resolveByRule('booking.cancelled', bookingId as string);
        },
        resolveData: (e) => self.buildBookingData(e),
      },
      {
        // Admin-issued ticket = confirmed for the customer.
        eventType: 'booking.issued',
        templateKey: EmailTemplateKey.BOOKING_CONFIRMED,
        resolveRecipients: (e) => {
          const { bookingId } = e.payload as Record<string, unknown>;
          return self.recipientResolver.resolveByRule('booking.confirmed', bookingId as string);
        },
        resolveData: (e) => self.buildBookingData(e),
      },
      {
        // Paid but waiting on admin issue — nudge admins, not the customer.
        eventType: 'booking.awaiting_issue',
        templateKey: EmailTemplateKey.ADMIN_PAYMENT_RECEIVED,
        resolveRecipients: () => self.recipientResolver.resolveAdmins(),
        resolveData: (e) => {
          const p = e.payload as Record<string, unknown>;
          return {
            paymentId: p.paymentId,
            bookingId: p.bookingId,
            bookingType: p.bookingType ?? 'flight',
            customerName: p.customerName ?? 'Customer',
            amount: String(p.amount ?? 0),
            currency: p.currency ?? 'USD',
          };
        },
      },
      {
        eventType: 'payment.succeeded',
        templateKey: EmailTemplateKey.ADMIN_PAYMENT_RECEIVED,
        resolveRecipients: () => self.recipientResolver.resolveAdmins(),
        resolveData: (e) => {
          const p = e.payload as Record<string, unknown>;
          return {
            paymentId: p.paymentId,
            bookingId: p.bookingId,
            bookingType: p.bookingType ?? 'flight',
            customerName: p.customerName ?? 'Customer',
            amount: String(p.amount ?? 0),
            currency: p.currency ?? 'USD',
          };
        },
      },
      {
        eventType: 'payment.failed',
        templateKey: EmailTemplateKey.BOOKING_FAILED,
        resolveRecipients: (e) => {
          const { bookingId } = e.payload as Record<string, unknown>;
          return self.recipientResolver.resolveByRule('payment.failed', bookingId as string);
        },
        resolveData: (e) => ({
          ...self.buildBookingData(e),
          reason: 'Payment failed',
        }),
        severity: 'critical',
      },
      {
        eventType: 'refund.completed',
        templateKey: EmailTemplateKey.REFUND_COMPLETED,
        resolveRecipients: (e) => {
          const { bookingId } = e.payload as Record<string, unknown>;
          return self.recipientResolver.resolveByRule('refund.completed', bookingId as string);
        },
        resolveData: (e) => {
          const p = e.payload as Record<string, unknown>;
          return {
            refundId: p.refundId ?? e.aggregateId ?? 'unknown',
            bookingId: p.bookingId ?? e.aggregateId ?? 'unknown',
            passengerName: p.passengerName ?? p.customerName ?? 'Customer',
            refundAmount: String(p.amount ?? p.refundAmount ?? 0),
            currency: p.currency ?? 'USD',
          };
        },
      },
      {
        eventType: 'INVOICE_EMAIL',
        templateKey: EmailTemplateKey.INVOICE_READY,
        resolveRecipients: (e) => {
          const p = e.payload as Record<string, unknown>;
          return self.recipientResolver.resolveByRule('INVOICE_EMAIL', p.bookingId as string);
        },
        resolveData: (e) => {
          const p = e.payload as Record<string, unknown>;
          return {
            invoiceNumber: p.invoiceNumber ?? 'INV-000',
            bookingId: p.bookingId ?? e.aggregateId ?? 'unknown',
            recipientName: p.customerName ?? 'Customer',
            amount: String(p.amount ?? 0),
            currency: p.currency ?? 'USD',
          };
        },
      },
    ];

    for (const mapping of eventMap) {
      this.dispatcher.register(mapping.eventType, async (event: OutboxEventEntity) => {
        try {
          const idempotencyKey = `email:${event.eventType}:${event.aggregateId ?? 'none'}:${event.idempotencyKey}`;
          const recipients = await mapping.resolveRecipients(event);

          if (recipients.length === 0) {
            this.logger.debug(`No recipients for ${event.eventType}, skipping email`);
            return;
          }

          const data = mapping.resolveData(event);

          const email = await this.emailService.createAndQueueEmail({
            type: event.eventType,
            templateKey: mapping.templateKey,
            idempotencyKey,
            data,
            aggregateType: event.aggregateType ?? undefined,
            aggregateId: event.aggregateId ?? undefined,
            severity: mapping.severity,
            recipients,
          });

          // Immediate dispatch — don't wait for the 30-second cron
          if (email) {
            void this.emailDispatcher.dispatchMessage(email.id).catch(() => {});
          }
        } catch (err: unknown) {
          this.logger.error(
            `Email handler error for ${event.eventType}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      });
    }
  }

  private buildBookingData(event: OutboxEventEntity, fallbackType?: string): Record<string, unknown> {
    const p = event.payload as Record<string, unknown>;
    return {
      bookingId: p.bookingId ?? event.aggregateId ?? 'unknown',
      bookingType: p.bookingType ?? fallbackType ?? 'flight',
      passengerName: p.passengerName ?? p.customerName ?? p.guestName ?? 'Customer',
      locatorCode: p.locatorCode,
      route: p.route,
      hotelName: p.hotelName,
      dates: p.dates,
      totalPrice: String(p.totalPrice ?? p.amount ?? 0),
      currency: p.currency ?? 'USD',
    };
  }
}
