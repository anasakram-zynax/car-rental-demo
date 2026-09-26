import { baseEmailWrapper, heroBanner, bookingDetailCard, sectionHeading, infoCallout, ctaButton, sectionDivider, esc } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface BookingFailedEmailData {
  bookingId: string;
  bookingType: string;
  passengerName: string;
  route?: string;
  hotelName?: string;
  reason?: string;
  refundPending?: boolean;
}

export function bookingFailedTemplate(data: BookingFailedEmailData): EmailTemplateResult {
  const isFlight = data.bookingType === 'flight';
  const shortId = data.bookingId.slice(0, 8).toUpperCase();
  const subject = `Booking Issue — ${shortId} | TravelsOTA`;

  const body = `
    ${heroBanner({
      title: 'Booking Could Not Be Completed',
      subtitle: `Hi ${esc(data.passengerName)}, we're sorry — we couldn't complete your ${data.bookingType} booking.`,
      bgColor: '#991b1b',
      icon: '⚠️',
    })}

    <div style="padding:32px;">
      ${sectionHeading('Booking Details')}

      ${bookingDetailCard([
        { label: 'Booking ID', value: shortId, highlight: true },
        { label: 'Type', value: isFlight ? 'Flight' : 'Hotel' },
        ...(data.route ? [{ label: 'Route', value: data.route }] : []),
        ...(data.hotelName ? [{ label: 'Hotel', value: data.hotelName }] : []),
        ...(data.reason ? [{ label: 'Reason', value: data.reason }] : []),
      ])}

      ${sectionHeading('What Happened')}

      ${data.refundPending ? `
        ${infoCallout({
          title: 'Refund In Progress',
          message: 'You were charged for this booking. A full refund is being processed and will appear on your statement within 5-10 business days.',
          variant: 'warning',
        })}
      ` : `
        ${infoCallout({
          title: 'No Payment Was Taken',
          message: 'Your payment method was not charged. You can try booking again with no additional cost.',
          variant: 'info',
        })}
      `}

      ${infoCallout({
        title: 'Why Did This Happen?',
        message: data.reason
          ? `The supplier reported: ${data.reason}. This can happen when prices change, availability shifts, or there's a temporary issue with the supplier system.`
          : 'This can happen when prices change, availability shifts, or there\'s a temporary issue with the supplier system. Please try again.',
        variant: 'info',
      })}

      ${sectionHeading('What You Can Do')}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#64748b;">1. Search again — prices and availability update in real-time</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#64748b;">2. Try different dates or alternative properties</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#64748b;">3. Contact our support team if you need assistance</td>
        </tr>
      </table>

      ${ctaButton('https://travelsota.com/search', 'Search Again')}

      ${sectionDivider()}

      <p style="margin:0;font-size:14px;color:#64748b;text-align:center;">
        Need help? Contact us at <a href="mailto:support@travelsota.com" style="color:#033d4a;font-weight:600;">support@travelsota.com</a> — we're here 24/7.
      </p>
    </div>
  `;

  return {
    subject,
    html: baseEmailWrapper(body),
    text: `Booking Issue — Your ${data.bookingType} booking ${shortId} could not be completed. ${data.reason ? `Reason: ${data.reason}.` : ''} ${data.refundPending ? 'A refund is being processed.' : 'No payment was taken.'} Please try searching again.`,
  };
}
