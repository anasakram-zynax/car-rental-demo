import { baseEmailWrapper, heroBanner, bookingDetailCard, sectionHeading, infoCallout, ctaButton, sectionDivider, esc } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface BookingCancelledEmailData {
  bookingId: string;
  bookingType: string;
  passengerName: string;
  locatorCode?: string;
  route?: string;
  hotelName?: string;
  refundAmount?: string;
  currency?: string;
}

export function bookingCancelledTemplate(data: BookingCancelledEmailData): EmailTemplateResult {
  const isFlight = data.bookingType === 'flight';
  const ref = data.locatorCode ?? data.bookingId.slice(0, 8).toUpperCase();
  const subject = `Booking Cancelled — ${ref} | TravelsOTA`;
  const hasRefund = !!data.refundAmount && data.currency;

  const body = `
    ${heroBanner({
      title: 'Booking Cancelled',
      subtitle: `Hi ${esc(data.passengerName)}, your ${data.bookingType} booking has been successfully cancelled.`,
      bgColor: '#991b1b',
      icon: '❌',
    })}

    <div style="padding:32px;">
      ${sectionHeading('Cancellation Details')}

      ${bookingDetailCard([
        { label: 'Booking Ref', value: ref, highlight: true },
        { label: 'Type', value: isFlight ? 'Flight' : 'Hotel' },
        ...(data.route ? [{ label: 'Route', value: data.route }] : []),
        ...(data.hotelName ? [{ label: 'Hotel', value: data.hotelName }] : []),
        { label: 'Status', value: 'Cancelled' },
      ])}

      ${hasRefund ? `
        ${sectionHeading('Refund Information')}

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ecfdf5;border:1px solid #10b981;border-radius:12px;padding:20px;margin-bottom:20px;">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-size:12px;color:#065f46;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Refund Amount</p>
              <p style="margin:0;font-size:28px;font-weight:800;color:#065f46;">${esc(data.currency!)} ${esc(data.refundAmount!)}</p>
            </td>
          </tr>
        </table>

        ${infoCallout({
          title: 'Refund Timeline',
          message: 'Refunds are processed within 5-10 business days depending on your bank or payment provider. You\'ll receive a separate email when the refund is complete.',
          variant: 'success',
        })}
      ` : `
        ${infoCallout({
          title: 'No Payment Was Taken',
          message: 'Since no payment was processed for this booking, no refund is required.',
          variant: 'info',
        })}
      `}

      ${infoCallout({
        title: 'Changed Your Mind?',
        message: 'You can search and book again anytime. Prices may vary based on availability.',
        variant: 'info',
      })}

      ${ctaButton('https://travelsota.com/search', 'Search Again')}

      ${sectionDivider()}

      <p style="margin:0;font-size:14px;color:#64748b;text-align:center;">
        If you didn't request this cancellation, please contact us immediately at <a href="mailto:support@travelsota.com" style="color:#033d4a;font-weight:600;">support@travelsota.com</a>
      </p>
    </div>
  `;

  return {
    subject,
    html: baseEmailWrapper(body),
    text: `Booking Cancelled — Ref: ${ref}. ${hasRefund ? `Refund of ${data.currency} ${data.refundAmount} will be processed within 5-10 business days.` : 'No payment was taken.'}`,
  };
}
