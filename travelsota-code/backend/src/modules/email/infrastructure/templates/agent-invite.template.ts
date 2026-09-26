import { baseEmailWrapper, heroBanner, ctaButton, infoCallout, esc } from './base-email.template';
import type { EmailTemplateResult } from '../../domain/email-event-types';

export interface AgentInviteEmailData {
  email: string;
  agentName: string;
  inviteUrl: string;
  roleName: string;
  expiresInDays: number;
}

export function agentInviteTemplate(data: AgentInviteEmailData): EmailTemplateResult {
  const subject = `You're invited to join a travel agency on TravelsOTA`;

  const body = `
    ${heroBanner({
      title: 'Agency Invitation',
      subtitle: `You've been invited by ${esc(data.agentName)} to join their travel agency team on TravelsOTA as a sub-agent.`,
      bgColor: '#065f46',
      icon: '🤝',
    })}

    <div style="padding:32px;">
      ${infoCallout({
        title: 'Invitation Details',
        message: `
          <strong>Role:</strong> ${esc(data.roleName)}<br/>
          <strong>Expires:</strong> ${data.expiresInDays} day${data.expiresInDays > 1 ? 's' : ''}
        `,
        variant: 'info',
      })}

      <p style="margin:24px 0 16px;font-size:15px;color:#334155;text-align:center;">
        Click the button below to accept the invitation and set up your account.
      </p>

      ${ctaButton(data.inviteUrl, 'Accept Invitation', 'success')}

      <p style="margin:24px 0 8px;font-size:13px;color:#94a3b8;text-align:center;">
        This invitation was sent to ${esc(data.email)}.<br/>
        If you weren't expecting this, you can safely ignore this email.
      </p>

      <p style="margin:0;font-size:14px;color:#64748b;text-align:center;">
        Questions? Contact us at <a href="mailto:support@travelsota.com" style="color:#033d4a;font-weight:600;">support@travelsota.com</a>
      </p>
    </div>
  `;

  return {
    subject,
    html: baseEmailWrapper(body),
    text: `You've been invited by ${data.agentName} to join their travel agency on TravelsOTA as a ${data.roleName}. Accept here: ${data.inviteUrl} (expires in ${data.expiresInDays} days)`,
  };
}
