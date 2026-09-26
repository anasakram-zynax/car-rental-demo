export interface EmailTemplateResult {
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendInput {
  from: string;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
  tags?: Record<string, string>;
}

export type EmailProviderName = 'resend' | 'smtp' | 'mock';

export interface EmailSendResult {
  provider: EmailProviderName;
  providerMessageId: string;
  raw?: unknown;
}

export interface EmailRecipientInfo {
  email: string;
  recipientType: 'customer' | 'agent' | 'staff' | 'admin';
  userId?: string;
}

export interface EmailEventPayload {
  bookingId?: string;
  bookingType?: 'flight' | 'hotel';
  paymentId?: string;
  refundId?: string;
  documentId?: string;
  invoiceNumber?: string;
  [key: string]: unknown;
}
