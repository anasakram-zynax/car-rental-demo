import { baseEmailWrapper, heroBanner, bookingDetailCard, sectionHeading, infoCallout, sectionDivider, esc, BRAND } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface AdminBookingFailedEmailData {
  bookingId: string;
  bookingType: string;
  customerName: string;
  reason?: string;
}

export function adminBookingFailedTemplate(data: AdminBookingFailedEmailData): EmailTemplateResult {
  const shortId = data.bookingId.slice(0, 8).toUpperCase();
  const subject = `[Admin] Booking Failed — ${shortId}`;

  const body = `
    ${heroBanner({
      title: 'Booking Failed',
      subtitle: `A ${data.bookingType} booking has failed and requires attention.`,
      bgColor: '#991b1b',
      icon: '🚨',
    })}

    <div style="padding:32px;">
      ${sectionHeading('Affected Booking')}

      ${bookingDetailCard([
        { label: 'Booking ID', value: shortId, highlight: true },
        { label: 'Type', value: data.bookingType === 'flight' ? 'Flight' : 'Hotel' },
        { label: 'Customer', value: data.customerName },
        ...(data.reason ? [{ label: 'Failure Reason', value: data.reason }] : []),
      ])}

      ${data.reason ? infoCallout({
        title: 'Error Details',
        message: data.reason,
        variant: 'error',
      }) : ''}

      ${infoCallout({
        title: 'Recommended Actions',
        message: 'Review the booking in the admin dashboard. Check if a refund was triggered. Contact the customer if manual intervention is needed.',
        variant: 'warning',
      })}

      ${sectionDivider()}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:${BRAND.error};border-radius:10px;">
                  <a href="https://travelsota.com/admin/bookings/${shortId}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Review in Admin Dashboard</a>
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
    text: `[Admin] Booking Failed — ${shortId} — Customer: ${data.customerName}. ${data.reason ? `Reason: ${data.reason}` : ''} Review in admin dashboard.`,
  };
}
