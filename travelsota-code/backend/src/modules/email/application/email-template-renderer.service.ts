import { Injectable, Logger } from '@nestjs/common';
import { EmailTemplateKey } from '../domain/email-template-key.enum';
import type { EmailTemplateResult } from '../domain/email-event-types';
import { bookingCreatedTemplate, type BookingCreatedEmailData } from '../infrastructure/templates/booking-created.template';
import { bookingConfirmedTemplate, type BookingConfirmedEmailData } from '../infrastructure/templates/booking-confirmed.template';
import { bookingFailedTemplate, type BookingFailedEmailData } from '../infrastructure/templates/booking-failed.template';
import { bookingCancelledTemplate, type BookingCancelledEmailData } from '../infrastructure/templates/booking-cancelled.template';
import { refundCompletedTemplate, type RefundCompletedEmailData } from '../infrastructure/templates/refund-completed.template';
import { invoiceReadyTemplate, type InvoiceReadyEmailData } from '../infrastructure/templates/invoice-ready.template';
import { adminBookingCreatedTemplate, type AdminBookingCreatedEmailData } from '../infrastructure/templates/admin-booking-created.template';
import { adminBookingFailedTemplate, type AdminBookingFailedEmailData } from '../infrastructure/templates/admin-booking-failed.template';
import { adminPaymentReceivedTemplate, type AdminPaymentReceivedEmailData } from '../infrastructure/templates/admin-payment-received.template';
import { testEmailTemplate, type TestEmailData } from '../infrastructure/templates/test-email.template';
import { agentInviteTemplate, type AgentInviteEmailData } from '../infrastructure/templates/agent-invite.template';
import { demoVerifyEmailTemplate, type DemoVerifyEmailData } from '../infrastructure/templates/demo-verify-email.template';
import { demoCredentialsTemplate, type DemoCredentialsEmailData } from '../infrastructure/templates/demo-credentials.template';
import { adminDemoLeadTemplate, type AdminDemoLeadEmailData } from '../infrastructure/templates/admin-demo-lead.template';

@Injectable()
export class EmailTemplateRenderer {
  private readonly logger = new Logger(EmailTemplateRenderer.name);

  render(templateKey: string, data: Record<string, unknown>): EmailTemplateResult {
    switch (templateKey) {
      case EmailTemplateKey.BOOKING_CREATED:
        return bookingCreatedTemplate(data as unknown as BookingCreatedEmailData);
      case EmailTemplateKey.BOOKING_CONFIRMED:
        return bookingConfirmedTemplate(data as unknown as BookingConfirmedEmailData);
      case EmailTemplateKey.BOOKING_FAILED:
        return bookingFailedTemplate(data as unknown as BookingFailedEmailData);
      case EmailTemplateKey.BOOKING_CANCELLED:
        return bookingCancelledTemplate(data as unknown as BookingCancelledEmailData);
      case EmailTemplateKey.REFUND_COMPLETED:
        return refundCompletedTemplate(data as unknown as RefundCompletedEmailData);
      case EmailTemplateKey.INVOICE_READY:
        return invoiceReadyTemplate(data as unknown as InvoiceReadyEmailData);
      case EmailTemplateKey.ADMIN_BOOKING_CREATED:
        return adminBookingCreatedTemplate(data as unknown as AdminBookingCreatedEmailData);
      case EmailTemplateKey.ADMIN_BOOKING_FAILED:
        return adminBookingFailedTemplate(data as unknown as AdminBookingFailedEmailData);
      case EmailTemplateKey.ADMIN_PAYMENT_RECEIVED:
        return adminPaymentReceivedTemplate(data as unknown as AdminPaymentReceivedEmailData);
      case EmailTemplateKey.TEST_EMAIL:
        return testEmailTemplate(data as unknown as TestEmailData);
      case EmailTemplateKey.AGENT_INVITE:
        return agentInviteTemplate(data as unknown as AgentInviteEmailData);
      case EmailTemplateKey.DEMO_VERIFY_EMAIL:
        return demoVerifyEmailTemplate(data as unknown as DemoVerifyEmailData);
      case EmailTemplateKey.DEMO_CREDENTIALS:
        return demoCredentialsTemplate(data as unknown as DemoCredentialsEmailData);
      case EmailTemplateKey.ADMIN_DEMO_LEAD:
        return adminDemoLeadTemplate(data as unknown as AdminDemoLeadEmailData);
      default:
        this.logger.warn(`Unknown template key: ${templateKey}`);
        return {
          subject: (data.subject as string) ?? 'Notification',
          html: `<p>${(data.message as string) ?? 'No content'}</p>`,
          text: (data.message as string) ?? 'No content',
        };
    }
  }
}
