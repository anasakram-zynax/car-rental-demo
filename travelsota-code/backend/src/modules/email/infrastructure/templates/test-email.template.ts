import { baseEmailWrapper, esc } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface TestEmailData {
  recipientEmail: string;
  sentBy?: string;
}

export function testEmailTemplate(data: TestEmailData): EmailTemplateResult {
  const subject = 'Test Email — TravelsOTA';
  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b;letter-spacing:-0.02em;">Test Email</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">
      This is a test email from TravelsOTA${data.sentBy ? ` sent by ${esc(data.sentBy)}` : ''}.
    </p>
    <p style="margin:0;font-size:13px;color:#64748b;">
      If you received this, the email service is working correctly.
    </p>
  `;

  return {
    subject,
    html: baseEmailWrapper(body),
    text: `Test Email — TravelsOTA email service is working correctly.`,
  };
}
