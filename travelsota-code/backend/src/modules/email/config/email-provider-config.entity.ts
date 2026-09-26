export type EmailProviderKey = 'smtp' | 'resend';

export interface SmtpEmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string;
}

export interface ResendEmailConfig {
  apiKey?: string;
}

export interface EmailProviderConfig {
  provider: EmailProviderKey;
  enabled: boolean;
  smtp: SmtpEmailConfig;
  resend: ResendEmailConfig;
  from: string;
  selectedProvider: EmailProviderKey;
}

export const DEFAULT_SMTP_CONFIG: Omit<SmtpEmailConfig, 'pass'> = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  user: '',
};

export const DEFAULT_RESEND_CONFIG: ResendEmailConfig = {
  apiKey: '',
};
