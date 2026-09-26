import { baseEmailWrapper, heroBanner, bookingDetailCard, sectionHeading, ctaButton, sectionDivider, esc } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface InvoiceReadyEmailData {
  invoiceNumber: string;
  bookingId: string;
  recipientName: string;
  amount: string;
  currency: string;
  downloadUrl?: string;
}

export function invoiceReadyTemplate(data: InvoiceReadyEmailData): EmailTemplateResult {
  const shortBookingId = data.bookingId.slice(0, 8).toUpperCase();
  const subject = `Invoice ${esc(data.invoiceNumber)} — TravelsOTA`;

  const body = `
    ${heroBanner({
      title: 'Your Invoice Is Ready',
      subtitle: `Hi ${esc(data.recipientName)}, your invoice for booking ${shortBookingId} is ready for download.`,
      bgColor: '#033d4a',
      icon: '📄',
    })}

    <div style="padding:32px;">
      ${sectionHeading('Invoice Details')}

      ${bookingDetailCard([
        { label: 'Invoice No.', value: data.invoiceNumber, highlight: true },
        { label: 'Booking Ref', value: shortBookingId },
        { label: 'Amount', value: `${data.currency} ${data.amount}`, highlight: true },
      ])}

      ${data.downloadUrl ? `
        ${ctaButton(data.downloadUrl, 'Download Invoice')}

        <p style="margin:-16px 0 24px;font-size:12px;color:#64748b;text-align:center;">
          PDF format — suitable for expense reports and tax records
        </p>
      ` : ''}

      ${sectionHeading('Need a Copy?')}

      <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;">
        You can always access your invoices from your account dashboard. If you need a modified invoice or have billing questions, contact our support team.
      </p>

      ${sectionDivider()}

      <p style="margin:0;font-size:14px;color:#64748b;text-align:center;">
        Billing questions? Contact us at <a href="mailto:support@travelsota.com" style="color:#033d4a;font-weight:600;">support@travelsota.com</a>
      </p>
    </div>
  `;

  return {
    subject,
    html: baseEmailWrapper(body),
    text: `Invoice ${data.invoiceNumber} — ${data.currency} ${data.amount} for booking ${shortBookingId}. ${data.downloadUrl ? `Download: ${data.downloadUrl}` : ''}`,
  };
}
