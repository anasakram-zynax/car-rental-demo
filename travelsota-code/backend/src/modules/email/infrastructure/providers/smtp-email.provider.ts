import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { EmailProviderPort } from './email-provider.port';
import type { EmailSendInput, EmailSendResult } from '../../domain/email-event-types';

@Injectable()
export class SmtpEmailProvider implements EmailProviderPort {
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private readonly transporter: Transporter;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      throw new Error(
        'SMTP configuration incomplete: SMTP_HOST, SMTP_USER, and SMTP_PASS are required',
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    this.logger.log(`SMTP provider created: ${host}:${port} (secure=${secure})`);
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const to = Array.isArray(input.to) ? input.to.join(', ') : input.to;

    const attachments = input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    }));

    const info = await this.transporter.sendMail({
      from: input.from,
      to,
      cc: input.cc?.length ? input.cc.join(', ') : undefined,
      bcc: input.bcc?.length ? input.bcc.join(', ') : undefined,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments,
    });

    this.logger.log(`Email sent via SMTP: messageId=${info.messageId}`);
    return {
      provider: 'smtp',
      providerMessageId: info.messageId,
      raw: { accepted: info.accepted, rejected: info.rejected, response: info.response },
    };
  }
}
