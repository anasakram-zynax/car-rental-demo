import { baseEmailWrapper, heroBanner, bookingDetailCard, sectionHeading, sectionDivider, esc, BRAND } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface AdminBookingCreatedEmailData {
  bookingId: string;
  bookingType: string;
  customerName: string;
  customerEmail?: string;
  route?: string;
  hotelName?: string;
  dates?: string;
  totalPrice: string;
  currency: string;
  agentName?: string;
}

export function adminBookingCreatedTemplate(data: AdminBookingCreatedEmailData): EmailTemplateResult {
  const isFlight = data.bookingType === 'flight';
  const shortId = data.bookingId.slice(0, 8).toUpperCase();
  const subject = `[Admin] New ${data.bookingType} Booking — ${shortId}`;

  const body = `
    ${heroBanner({
      title: 'New Booking Received',
      subtitle: `A new ${data.bookingType} booking requires your attention.`,
      bgColor: '#1e40af',
      icon: '📋',
    })}

    <div style="padding:32px;">
      ${sectionHeading('Customer Information')}

      ${bookingDetailCard([
        { label: 'Customer', value: data.customerName, highlight: true },
        ...(data.customerEmail ? [{ label: 'Email', value: data.customerEmail }] : []),
        ...(data.agentName ? [{ label: 'Agent', value: data.agentName }] : []),
      ])}

      ${sectionHeading('Booking Details')}

      ${bookingDetailCard([
        { label: 'Booking ID', value: shortId, highlight: true },
        { label: 'Type', value: isFlight ? 'Flight' : 'Hotel' },
        ...(data.route ? [{ label: 'Route', value: data.route }] : []),
        ...(data.hotelName ? [{ label: 'Hotel', value: data.hotelName }] : []),
        ...(data.dates ? [{ label: 'Dates', value: data.dates }] : []),
        { label: 'Total', value: `${data.currency} ${data.totalPrice}`, highlight: true },
      ])}

      ${sectionDivider()}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background-color:${BRAND.primary};border-radius:10px;">
                  <a href="https://travelsota.com/admin/bookings/${shortId}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">View in Admin Dashboard</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:20px 0 0;font-size:13px;color:#64748b;text-align:center;">
        Booking was created at ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
    </div>
  `;

  return {
    subject,
    html: baseEmailWrapper(body),
    text: `[Admin] New ${data.bookingType} booking ${shortId} — Customer: ${data.customerName}, Total: ${data.currency} ${data.totalPrice}.`,
  };
}
