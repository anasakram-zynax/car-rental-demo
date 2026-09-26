import { baseEmailWrapper, esc, ctaButton, heroBanner, infoCallout } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface DemoCredentialsEmailData {
  adminEmail: string;
  adminPassword: string;
  adminUrl: string;
  agentEmail: string;
  agentPassword: string;
  agentUrl: string;
  userEmail: string;
  userPassword: string;
  userUrl: string;
  confirmUrl: string;
  name?: string;
}

function credentialCard(label: string, email: string, password: string, url: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;margin:0 0 16px;padding:20px;">
      <tr>
        <td>
          <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#1e293b;letter-spacing:-0.01em;">${esc(label)} Dashboard</p>
          <p style="margin:0 0 4px;font-size:14px;color:#64748b;">
            <strong style="color:#1e293b;">Email:</strong> ${esc(email)}
          </p>
          <p style="margin:0 0 16px;font-size:14px;color:#64748b;">
            <strong style="color:#1e293b;">Password:</strong> ${esc(password)}
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:#033d4a;border-radius:8px;">
                <a href="${esc(url)}" style="display:inline-block;padding:10px 20px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">Open Dashboard</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

export function demoCredentialsTemplate(data: DemoCredentialsEmailData): EmailTemplateResult {
  const greeting = data.name ? `Hi ${esc(data.name)},` : 'Hi,';
  const body = `
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;letter-spacing:-0.02em;">Your Demo Credentials Are Ready!</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;">
        ${greeting} Below you will find your access credentials for all three TravelsOTA dashboards. These are shared demo environments — please do not enter any personal information.
      </p>
      ${credentialCard('Admin', data.adminEmail, data.adminPassword, data.adminUrl)}
      ${credentialCard('Agent', data.agentEmail, data.agentPassword, data.agentUrl)}
      ${credentialCard('Customer', data.userEmail, data.userPassword, data.userUrl)}
      ${infoCallout({
        title: 'Shared Demo Environment',
        message: 'These are shared demo accounts. Data resets periodically. Please do not enter real personal or payment information.',
        variant: 'warning',
      })}
      ${ctaButton(data.confirmUrl, 'Confirm My Email Address', 'primary')}
      <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;text-align:center;">
        Confirm your email so we can keep you updated about TravelsOTA.
      </p>
    </div>
  `;

  return {
    subject: `Your TravelsOTA Demo Credentials — Access All Dashboards`,
    html: baseEmailWrapper(body, { supportEmail: 'team@travelsota.com' }),
    text: [
      `${greeting} Your TravelsOTA demo credentials:`,
      `Admin Dashboard: ${data.adminEmail} / ${data.adminPassword} — ${data.adminUrl}`,
      `Agent Dashboard: ${data.agentEmail} / ${data.agentPassword} — ${data.agentUrl}`,
      `Customer Dashboard: ${data.userEmail} / ${data.userPassword} — ${data.userUrl}`,
      '',
      'Confirm your email: ' + data.confirmUrl,
    ].join('\n'),
  };
}
