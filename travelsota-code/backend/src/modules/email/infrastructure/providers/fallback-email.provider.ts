import { Injectable, Logger } from '@nestjs/common';
import type { EmailProviderPort } from './email-provider.port';
import type { EmailSendInput, EmailSendResult } from '../../domain/email-event-types';
import { ResendEmailProvider } from './resend-email.provider';
import { SmtpEmailProvider } from './smtp-email.provider';
import { MockEmailProvider } from './mock-email.provider';

function isConfigError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('not configured') ||
    msg.includes('configuration incomplete') ||
    msg.includes('invalid api key') ||
    msg.includes('unauthorized') ||
    msg.includes('403') ||
    msg.includes('401')
  );
}

@Injectable()
export class FallbackEmailProvider implements EmailProviderPort {
  private readonly logger = new Logger(FallbackEmailProvider.name);
  private readonly resend: ResendEmailProvider | null = null;
  private readonly smtp: SmtpEmailProvider | null = null;
  private readonly mock: MockEmailProvider;
  private readonly isProduction: boolean;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';

    // Try Resend
    if (process.env.RESEND_API_KEY) {
      try {
        this.resend = new ResendEmailProvider();
      } catch {
        this.logger.warn('Failed to initialize Resend provider');
      }
    }

    // Try SMTP
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        this.smtp = new SmtpEmailProvider();
      } catch {
        this.logger.warn('Failed to initialize SMTP provider');
      }
    }

    this.mock = new MockEmailProvider();

    this.logger.log(
      `Fallback provider initialized: resend=${!!this.resend}, smtp=${!!this.smtp}, production=${this.isProduction}`,
    );
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    // 1. If Resend is configured, try it first
    if (this.resend) {
      try {
        return await this.resend.send(input);
      } catch (err: unknown) {
        if (isConfigError(err) && this.smtp) {
          // Config/auth error on Resend — fallback to SMTP
          this.logger.warn(`Resend config error, falling back to SMTP: ${err instanceof Error ? err.message : err}`);
          return this.smtp.send(input);
        }
        // Unknown Resend error (timeout, network) — do NOT blindly fallback (risk duplicates)
        throw err;
      }
    }

    // 2. If SMTP is configured, use it
    if (this.smtp) {
      return this.smtp.send(input);
    }

    // 3. Mock in non-production only
    if (!this.isProduction) {
      this.logger.warn('No email provider configured — using mock (dev only)');
      return this.mock.send(input);
    }

    // 4. Production with no provider = hard fail
    throw new Error(
      'No email provider configured in production. Set EMAIL_PROVIDER=resend with RESEND_API_KEY, or configure SMTP_HOST/SMTP_USER/SMTP_PASS.',
    );
  }
}
