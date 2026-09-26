import { baseEmailWrapper, heroBanner, bookingDetailCard, sectionHeading, infoCallout, ctaButton, priceRow, sectionDivider, esc } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface BookingConfirmedEmailData {
  bookingId: string;
  bookingType: string;
  passengerName: string;
  locatorCode?: string;
  route?: string;
  hotelName?: string;
  dates?: string;
  totalPrice: string;
  currency: string;
  manageBookingUrl?: string;
}

export function bookingConfirmedTemplate(data: BookingConfirmedEmailData): EmailTemplateResult {
  const isFlight = data.bookingType === 'flight';
  const ref = data.locatorCode ?? data.bookingId.slice(0, 8).toUpperCase();
  const subject = `Booking Confirmed — ${ref} | TravelsOTA`;

  const body = `
    ${heroBanner({
      title: 'Booking Confirmed',
      subtitle: `Great news, ${esc(data.passengerName)}! Your ${data.bookingType} booking is confirmed and ready.`,
      bgColor: '#065f46',
      icon: '✅',
    })}

    <div style="padding:32px;">
      <!-- Confirmation Reference -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ecfdf5;border:2px solid #10b981;border-radius:12px;padding:20px;margin-bottom:24px;">
        <tr>
          <td align="center">
            <p style="margin:0 0 4px;font-size:12px;color:#065f46;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Your Confirmation Reference</p>
            <p style="margin:0;font-size:28px;font-weight:800;color:#065f46;letter-spacing:0.05em;">${esc(ref)}</p>
          </td>
        </tr>
      </table>

      ${sectionHeading('Booking Details')}

      ${bookingDetailCard([
        { label: 'Confirmation Ref', value: ref, highlight: true },
        { label: 'Type', value: isFlight ? 'Flight' : 'Hotel' },
        ...(data.route ? [{ label: 'Route', value: data.route }] : []),
        ...(data.hotelName ? [{ label: 'Hotel', value: data.hotelName }] : []),
        ...(data.dates ? [{ label: 'Travel Dates', value: data.dates }] : []),
      ])}

      ${sectionHeading('Payment Summary')}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${'#f8fafc'};border:1px solid #e2e8f0;border-radius:12px;padding:4px 20px;">
        ${priceRow('Amount Paid', `${data.currency} ${data.totalPrice}`, { bold: true, last: true })}
      </table>

      ${sectionHeading('Important Information')}

      ${isFlight ? `
        ${infoCallout({
          title: 'Check-in Opens 24-48 Hours Before Departure',
          message: 'Check in online or at the airport counter. Have your confirmation reference and a valid ID ready.',
          variant: 'info',
        })}
        ${infoCallout({
          title: 'Bring to the Airport',
          message: 'Valid passport/ID, confirmation reference, and any visa requirements for your destination.',
          variant: 'warning',
        })}
      ` : `
        ${infoCallout({
          title: 'Check-in / Check-out',
          message: 'Standard check-in is 3:00 PM and check-out is 11:00 AM. Contact the hotel directly for early/late arrangements.',
          variant: 'info',
        })}
        ${infoCallout({
          title: 'Bring to the Hotel',
          message: 'Your confirmation reference, valid ID, and the credit card used for booking.',
          variant: 'warning',
        })}
      `}

      ${data.manageBookingUrl ? ctaButton(data.manageBookingUrl, 'Manage Your Booking') : ''}

      ${sectionDivider()}

      <p style="margin:0;font-size:14px;color:#64748b;text-align:center;">
        Save this email — it contains your confirmation reference.<br/>
        Questions? Contact us at <a href="mailto:support@travelsota.com" style="color:#033d4a;font-weight:600;">support@travelsota.com</a>
      </p>
    </div>
  `;

  return {
    subject,
    html: baseEmailWrapper(body, { manageBookingUrl: data.manageBookingUrl }),
    text: `Booking Confirmed — Ref: ${ref}. Total paid: ${data.currency} ${data.totalPrice}. Save this reference for check-in.`,
  };
}
