import { Injectable, Logger } from '@nestjs/common';
import type { EmailProviderPort } from './email-provider.port';
import type { EmailSendInput, EmailSendResult } from '../../domain/email-event-types';

@Injectable()
export class ResendEmailProvider implements EmailProviderPort {
  private readonly logger = new Logger(ResendEmailProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.resend.com';

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY ?? '';
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    if (!this.apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const body: Record<string, unknown> = {
      from: input.from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
    };

    if (input.text) body.text = input.text;
    if (input.cc?.length) body.cc = input.cc;
    if (input.bcc?.length) body.bcc = input.bcc;
    if (input.tags) body.tags = Object.entries(input.tags).map(([name, value]) => ({ name, value }));

    if (input.attachments?.length) {
      body.attachments = input.attachments.map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
        content_type: a.contentType,
      }));
    }

    const response = await fetch(`${this.baseUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      const errMsg = (data as { message?: string })?.message ?? JSON.stringify(data);
      throw new Error(`Resend API error ${response.status}: ${errMsg}`);
    }

    this.logger.log(`Email sent via Resend: id=${data.id}`);
    return { provider: 'resend', providerMessageId: data.id as string, raw: data };
  }
}
