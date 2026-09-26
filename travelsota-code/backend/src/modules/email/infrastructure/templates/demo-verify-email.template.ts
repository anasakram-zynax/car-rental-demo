import { baseEmailWrapper, ctaButton } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface DemoVerifyEmailData {
  verifyUrl: string;
  recipientEmail: string;
}

export function demoVerifyEmailTemplate(data: DemoVerifyEmailData): EmailTemplateResult {
  const subject = 'Verify your email — TravelsOTA Demo Access';
  const body = `
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;letter-spacing:-0.02em;">Confirm Your Email</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;">
        Thanks for your interest in TravelsOTA! Click the button below to verify your email address and unlock demo access to all dashboards.
      </p>
      ${ctaButton(data.verifyUrl, 'Verify My Email', 'primary')}
      <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;line-height:1.5;">
        If the button does not work, copy and paste this link into your browser:<br />
        <span style="color:#64748b;">${data.verifyUrl}</span>
      </p>
      <p style="margin:32px 0 0;font-size:13px;color:#94a3b8;">
        This link expires in 15 minutes. Did not request this? You can safely ignore this email.
      </p>
    </div>
  `;

  return {
    subject,
    html: baseEmailWrapper(body, { supportEmail: 'team@travelsota.com' }),
    text: `Verify your email for TravelsOTA demo access: ${data.verifyUrl}`,
  };
}
