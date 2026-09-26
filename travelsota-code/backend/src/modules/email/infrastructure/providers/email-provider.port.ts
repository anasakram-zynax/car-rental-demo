import type { EmailSendInput, EmailSendResult } from '../../domain/email-event-types';

export const EMAIL_PROVIDER_PORT = 'EMAIL_PROVIDER_PORT';

export interface EmailProviderPort {
  send(input: EmailSendInput): Promise<EmailSendResult>;
}
