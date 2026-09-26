import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { SECRETS_CRYPTO } from '../../settings/application/services/provider-config.service';
import type { SecretsCryptoPort } from '../../settings/application/ports/secrets-crypto.port';
import {
  type EmailProviderConfig,
  type EmailProviderKey,
  DEFAULT_SMTP_CONFIG,
  DEFAULT_RESEND_CONFIG,
} from './email-provider-config.entity';

const EMAIL_MODULE_KEY = 'email';
const PROVIDER_SMTP = 'smtp';
const PROVIDER_RESEND = 'resend';

type DbRow = {
  id: string;
  module: string;
  provider: string;
  enabled: boolean;
  encryptedConfig: string;
};

@Injectable()
export class EmailConfigService {
  private readonly logger = new Logger(EmailConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRETS_CRYPTO) private readonly crypto: SecretsCryptoPort,
  ) {}

  async getConfig(): Promise<EmailProviderConfig> {
    const [smtpRow, resendRow] = await Promise.all([
      this.findRow(PROVIDER_SMTP),
      this.findRow(PROVIDER_RESEND),
    ]);

    const smtp = smtpRow ? this.decryptSmtp(smtpRow.encryptedConfig) : { ...DEFAULT_SMTP_CONFIG };
    const resend = resendRow ? this.decryptResend(resendRow.encryptedConfig) : { ...DEFAULT_RESEND_CONFIG };
    const smtpEnabled = smtpRow?.enabled ?? false;
    const resendEnabled = resendRow?.enabled ?? false;

    const from = process.env.EMAIL_FROM ?? 'TravelsOTA <noreply@travelsota.com>';
    const selectedProvider: EmailProviderKey = smtpEnabled ? 'smtp' : 'resend';

    return {
      provider: selectedProvider,
      enabled: smtpEnabled || resendEnabled,
      smtp,
      resend,
      from,
      selectedProvider,
    };
  }

  async updateConfig(provider: EmailProviderKey, config: Record<string, unknown>): Promise<EmailProviderConfig> {
    if (provider === PROVIDER_SMTP) {
      await this.upsertSmtp(config);
    } else {
      await this.upsertResend(config);
    }
    return this.getConfig();
  }

  async setEnabled(provider: EmailProviderKey, enabled: boolean): Promise<EmailProviderConfig> {
    const row = await this.findRow(provider);
    if (row) {
      await (this.prisma as any).providerConfig.update({
        where: { id: row.id },
        data: { enabled },
      });
    } else {
      const encryptedConfig = provider === PROVIDER_SMTP
        ? this.encryptSmtp({ ...DEFAULT_SMTP_CONFIG })
        : this.encryptResend({ ...DEFAULT_RESEND_CONFIG });
      await (this.prisma as any).providerConfig.create({
        data: {
          module: EMAIL_MODULE_KEY,
          provider,
          enabled,
          encryptedConfig,
        },
      });
    }
    return this.getConfig();
  }

  // ── private helpers ──

  private async findRow(provider: string): Promise<DbRow | null> {
    return (this.prisma as any).providerConfig.findUnique({
      where: { module_provider: { module: EMAIL_MODULE_KEY, provider } },
    }) as Promise<DbRow | null>;
  }

  private async upsertSmtp(raw: Record<string, unknown>): Promise<void> {
    const host = String(raw.host ?? '');
    const port = parseInt(String(raw.port ?? '587'), 10);
    const secure = raw.secure === true || raw.secure === 'true';
    const user = String(raw.user ?? '');
    const pass = raw.pass ? String(raw.pass) : undefined;

    const config = { host, port, secure, user, pass };
    const encryptedConfig = this.encryptSmtp(config);
    const enabled = raw.enabled !== false;

    await (this.prisma as any).providerConfig.upsert({
      where: { module_provider: { module: EMAIL_MODULE_KEY, provider: PROVIDER_SMTP } },
      create: { module: EMAIL_MODULE_KEY, provider: PROVIDER_SMTP, enabled, encryptedConfig },
      update: { enabled, encryptedConfig },
    });
  }

  private async upsertResend(raw: Record<string, unknown>): Promise<void> {
    const apiKey = raw.apiKey ? String(raw.apiKey) : undefined;
    const config = { apiKey };
    const encryptedConfig = this.encryptResend(config);
    const enabled = raw.enabled !== false;

    await (this.prisma as any).providerConfig.upsert({
      where: { module_provider: { module: EMAIL_MODULE_KEY, provider: PROVIDER_RESEND } },
      create: { module: EMAIL_MODULE_KEY, provider: PROVIDER_RESEND, enabled, encryptedConfig },
      update: { enabled, encryptedConfig },
    });
  }

  private encryptSmtp(config: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string }): string {
    const obj: Record<string, unknown> = {
      host: config.host ?? '',
      port: config.port ?? 587,
      secure: config.secure ?? false,
      user: config.user ?? '',
    };
    if (config.pass) obj.pass = this.crypto.encrypt(config.pass);
    return JSON.stringify(obj);
  }

  private decryptSmtp(encryptedConfig: string): any {
    const obj = JSON.parse(encryptedConfig);
    if (obj.pass) {
      obj.pass = this.crypto.decrypt(obj.pass);
    }
    return obj;
  }

  private encryptResend(config: { apiKey?: string }): string {
    const obj: Record<string, unknown> = {};
    if (config.apiKey) obj.apiKey = this.crypto.encrypt(config.apiKey);
    return JSON.stringify(obj);
  }

  private decryptResend(encryptedConfig: string): any {
    const obj = JSON.parse(encryptedConfig);
    if (obj.apiKey) {
      obj.apiKey = this.crypto.decrypt(obj.apiKey);
    }
    return obj;
  }

  async testConnection(provider: EmailProviderKey, config?: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    try {
      if (provider === 'smtp') {
        const nodemailer = await import('nodemailer');

        // If no form fields sent, load from DB
        let host: string, port: number, secure: boolean, user: string, pass: string;
        if (config && (config.host || config.user || config.pass)) {
          host = String(config.host ?? '');
          port = parseInt(String(config.port ?? '587'), 10);
          secure = config.secure === true || config.secure === 'true';
          user = String(config.user ?? '');
          pass = String(config.pass ?? '');
        } else {
          const row = await this.findRow(PROVIDER_SMTP);
          if (!row) return { success: false, message: 'No SMTP configuration saved. Fill in the form and save first.' };
          const decrypted = this.decryptSmtp(row.encryptedConfig);
          host = decrypted.host ?? '';
          port = decrypted.port ?? 587;
          secure = decrypted.secure ?? false;
          user = decrypted.user ?? '';
          pass = decrypted.pass ?? '';
        }

        if (!host || !user || !pass) {
          return { success: false, message: 'Incomplete SMTP config. Provide host, username, and password.' };
        }

        const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } } as any);
        await transporter.verify();
        return { success: true, message: `SMTP connected to ${host}:${port}` };
      }

      if (provider === 'resend') {
        let apiKey: string;
        if (config?.apiKey) {
          apiKey = String(config.apiKey);
        } else {
          const row = await this.findRow(PROVIDER_RESEND);
          if (!row) return { success: false, message: 'No Resend configuration saved. Fill in the API key and save first.' };
          const decrypted = this.decryptResend(row.encryptedConfig);
          apiKey = decrypted.apiKey ?? '';
        }

        if (!apiKey) return { success: false, message: 'No Resend API key configured.' };

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM ?? 'test@travelsota.com',
            to: ['test@example.com'],
            subject: 'Connection Test',
            html: '<p>TravelsOTA email configuration test</p>',
          }),
        });

        if (response.ok) {
          return { success: true, message: 'Resend API connected successfully.' };
        }
        const body = await response.json().catch(() => ({}));
        const errMsg = (body as any)?.message ?? `HTTP ${response.status}`;
        return { success: false, message: `Resend API error: ${errMsg}` };
      }

      return { success: false, message: `Unknown provider: ${provider}` };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Connection test failed.' };
    }
  }
}
