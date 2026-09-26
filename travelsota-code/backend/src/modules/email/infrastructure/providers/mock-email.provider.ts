import { Injectable, Logger } from '@nestjs/common';
import type { EmailProviderPort } from './email-provider.port';
import type { EmailSendInput, EmailSendResult } from '../../domain/email-event-types';

@Injectable()
export class MockEmailProvider implements EmailProviderPort {
  private readonly logger = new Logger(MockEmailProvider.name);

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const to = Array.isArray(input.to) ? input.to.join(', ') : input.to;
    this.logger.log(
      `[MOCK EMAIL] To: ${to} | Subject: ${input.subject} | Size: ${input.html.length} chars`,
    );
    return { provider: 'mock', providerMessageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}
