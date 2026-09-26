import { baseEmailWrapper, heroBanner, bookingDetailCard, sectionHeading, infoCallout, sectionDivider, esc, BRAND } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface AdminPaymentReceivedEmailData {
  paymentId: string;
  bookingId: string;
  bookingType: string;
  customerName: string;
  amount: string;
  currency: string;
}

export function adminPaymentReceivedTemplate(data: AdminPaymentReceivedEmailData): EmailTemplateResult {
  const shortPaymentId = data.paymentId.slice(0, 8).toUpperCase();
  const shortBookingId = data.bookingId.slice(0, 8).toUpperCase();
  const subject = `[Admin] Payment Received — ${data.currency} ${data.amount}`;

  const body = `
    ${heroBanner({
      title: 'Payment Received',
      subtitle: `A payment of ${data.currency} ${data.amount} has been successfully processed.`,
      bgColor: '#065f46',
      icon: '💰',
    })}

    <div style="padding:32px;">
      ${sectionHeading('Payment Details')}

      ${bookingDetailCard([
        { label: 'Payment ID', value: shortPaymentId, highlight: true },
        { label: 'Booking ID', value: shortBookingId },
        { label: 'Type', value: data.bookingType === 'flight' ? 'Flight' : 'Hotel' },
        { label: 'Customer', value: data.customerName },
        { label: 'Amount', value: `${data.currency} ${data.amount}`, highlight: true },
      ])}

      ${infoCallout({
        title: 'Next Step',
        message: 'The booking workflow will proceed automatically. The supplier confirmation will be triggered next.',
        variant: 'success',
      })}

      ${sectionDivider()}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:${BRAND.primary};border-radius:10px;">
                  <a href="https://travelsota.com/admin/bookings/${shortBookingId}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">View Booking</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return {
    subject,
    html: baseEmailWrapper(body),
    text: `[Admin] Payment Received — ${data.currency} ${data.amount} from ${data.customerName} for booking ${shortBookingId}.`,
  };
}
