import { apiRequest } from '@/lib/api/client';

export interface EmailProviderConfig {
  provider: 'smtp' | 'resend';
  enabled: boolean;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass?: string;
  };
  resend: {
    apiKey?: string;
  };
  from: string;
  selectedProvider: 'smtp' | 'resend';
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
}

export function getEmailProviderConfig(): Promise<EmailProviderConfig> {
  return apiRequest<EmailProviderConfig>('/admin/emails/settings', { method: 'GET', auth: true });
}

export function updateEmailProviderConfig(provider: 'smtp' | 'resend', config: {
  enabled?: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  apiKey?: string;
}): Promise<EmailProviderConfig> {
  return apiRequest<EmailProviderConfig>('/admin/emails/settings', {
    method: 'PUT',
    auth: true,
    body: { provider, ...config },
  });
}

export function testEmailProviderConnection(provider: 'smtp' | 'resend', config?: {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  apiKey?: string;
}): Promise<TestConnectionResult> {
  return apiRequest<TestConnectionResult>('/admin/emails/settings/test', {
    method: 'POST',
    auth: true,
    body: { provider, ...config },
  });
}
