import { baseEmailWrapper, heroBanner, bookingDetailCard, sectionHeading, infoCallout, timelineStep, sectionDivider, esc } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface BookingCreatedEmailData {
  bookingId: string;
  bookingType: string;
  passengerName: string;
  route?: string;
  hotelName?: string;
  dates?: string;
  totalPrice: string;
  currency: string;
}

export function bookingCreatedTemplate(data: BookingCreatedEmailData): EmailTemplateResult {
  const isFlight = data.bookingType === 'flight';
  const supplierName = isFlight ? 'airline' : 'hotel';
  const subject = `Booking Received — ${isFlight ? data.route ?? '' : data.hotelName ?? ''} | TravelsOTA`;
  const shortId = data.bookingId.slice(0, 8).toUpperCase();
  const totalDisplay = `${data.currency} ${data.totalPrice}`;

  const body = `
    ${heroBanner({
      title: 'Booking Received',
      subtitle: `Hi ${esc(data.passengerName)}, we've received your booking and our team is processing it now.`,
      bgColor: '#033d4a',
      icon: '✈️',
    })}

    <div style="padding:32px;">
      ${sectionHeading('Booking Details')}

      ${bookingDetailCard([
        { label: 'Booking ID', value: shortId, highlight: true },
        { label: 'Type', value: isFlight ? 'Flight' : 'Hotel' },
        ...(data.route ? [{ label: 'Route', value: data.route }] : []),
        ...(data.hotelName ? [{ label: 'Hotel', value: data.hotelName }] : []),
        ...(data.dates ? [{ label: 'Dates', value: data.dates }] : []),
        { label: 'Total Amount', value: totalDisplay, highlight: true },
      ])}

      ${sectionHeading('What Happens Next')}

      ${timelineStep(1, 'Booking Received', 'Your request has been logged and is being reviewed.', false)}
      ${timelineStep(2, 'Supplier Confirmation', `We're confirming availability and rates with the ${supplierName}. This usually takes a few minutes.`, false)}
      ${timelineStep(3, 'Confirmation Email', 'You\'ll receive a confirmation email with your full booking details and reference number.', true)}

      ${infoCallout({
        title: 'Processing Time',
        message: 'Most bookings are confirmed within minutes. If there\'s any delay, we\'ll keep you updated via email.',
        variant: 'info',
      })}

      ${sectionDivider()}

      <p style="margin:0;font-size:14px;color:#64748b;text-align:center;">
        Questions? Reply to this email or contact us at <a href="mailto:support@travelsota.com" style="color:#033d4a;font-weight:600;">support@travelsota.com</a>
      </p>
    </div>
  `;

  return {
    subject,
    html: baseEmailWrapper(body),
    text: `Booking Received — Your ${data.bookingType} booking ${shortId} is being processed. Total: ${data.currency} ${data.totalPrice}. You'll receive a confirmation email shortly.`,
  };
}
