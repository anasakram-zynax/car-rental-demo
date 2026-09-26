import { baseEmailWrapper, heroBanner, bookingDetailCard, sectionHeading, infoCallout, sectionDivider, esc } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface RefundCompletedEmailData {
  refundId: string;
  bookingId: string;
  passengerName: string;
  refundAmount: string;
  currency: string;
  method?: string;
}

export function refundCompletedTemplate(data: RefundCompletedEmailData): EmailTemplateResult {
  const shortRefundId = data.refundId.slice(0, 8).toUpperCase();
  const shortBookingId = data.bookingId.slice(0, 8).toUpperCase();
  const subject = `Refund Processed — ${data.currency} ${data.refundAmount} | TravelsOTA`;

  const body = `
    ${heroBanner({
      title: 'Refund Processed',
      subtitle: `Hi ${esc(data.passengerName)}, your refund has been successfully processed.`,
      bgColor: '#065f46',
      icon: '💸',
    })}

    <div style="padding:32px;">
      ${sectionHeading('Refund Details')}

      ${bookingDetailCard([
        { label: 'Refund ID', value: shortRefundId, highlight: true },
        { label: 'Booking Ref', value: shortBookingId },
        { label: 'Amount', value: `${data.currency} ${data.refundAmount}`, highlight: true },
        ...(data.method ? [{ label: 'Method', value: data.method }] : []),
      ])}

      ${infoCallout({
        title: 'When Will It Appear?',
        message: 'Refunds typically appear on your statement within 5-10 business days, depending on your bank or payment provider. You may see a pending credit before the full amount settles.',
        variant: 'success',
      })}

      ${infoCallout({
        title: 'Need Help?',
        message: 'If you don\'t see the refund after 10 business days, contact your bank first, then reach out to us with your refund reference number.',
        variant: 'info',
      })}

      ${sectionDivider()}

      <p style="margin:0;font-size:14px;color:#64748b;text-align:center;">
        Questions about this refund? Contact us at <a href="mailto:support@travelsota.com" style="color:#033d4a;font-weight:600;">support@travelsota.com</a>
      </p>
    </div>
  `;

  return {
    subject,
    html: baseEmailWrapper(body),
    text: `Refund Processed — ${data.currency} ${data.refundAmount} for booking ${shortBookingId}. Refund ID: ${shortRefundId}. Please allow 5-10 business days for the refund to appear on your statement.`,
  };
}
