import { baseEmailWrapper, esc, bookingDetailCard } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface AdminDemoLeadEmailData {
  name?: string;
  companyName?: string;
  email: string;
  whatsappNumber?: string;
  emailStatus: string;
  requestedAt: string;
}

export function adminDemoLeadTemplate(data: AdminDemoLeadEmailData): EmailTemplateResult {
  const body = `
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;letter-spacing:-0.02em;">New Demo Lead</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;">
        A visitor has just requested demo access to the TravelsOTA platform.
      </p>
      ${bookingDetailCard([
        { label: 'Name', value: data.name || '—' },
        { label: 'Company', value: data.companyName || '—' },
        { label: 'Email', value: data.email },
        { label: 'WhatsApp', value: data.whatsappNumber || '—' },
        { label: 'Email Status', value: data.emailStatus },
        { label: 'Requested At', value: data.requestedAt },
      ])}
      <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;">
        View all leads in the admin panel or export as CSV from the Demo Leads page.
      </p>
    </div>
  `;

  return {
    subject: `New Demo Lead${data.companyName ? ` — ${data.companyName}` : ''} (${data.email})`,
    html: baseEmailWrapper(body),
    text: [
      'New Demo Lead',
      `Name: ${data.name || '—'}`,
      `Company: ${data.companyName || '—'}`,
      `Email: ${data.email}`,
      `WhatsApp: ${data.whatsappNumber || '—'}`,
      `Status: ${data.emailStatus}`,
      `Requested: ${data.requestedAt}`,
    ].join('\n'),
  };
}
