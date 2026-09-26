import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import {
  DEFAULT_MONTHLY_CHAR_LIMIT,
  TRANSLATION_PROVIDER_MODULE,
  TRANSLATION_PROVIDER_NAME,
} from './translation-generator.service';

export interface TranslationConfigView {
  provider: 'gtx';
  keyRequired: false;
  monthlyCharLimit: number;
  charsUsedThisPeriod: number;
  remainingChars: number;
  periodKey: string;
}

// ponytail: gtx needs no key — row tracks usage only, created lazily.
@Injectable()
export class TranslationConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private currentPeriodKey(now = new Date()): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private async readRaw(): Promise<Record<string, unknown> | null> {
    const row = await this.prisma.providerConfig.findUnique({
      where: {
        module_provider: {
          module: TRANSLATION_PROVIDER_MODULE,
          provider: TRANSLATION_PROVIDER_NAME,
        },
      },
    });
    if (!row) return null;
    return JSON.parse(row.encryptedConfig) as Record<string, unknown>;
  }

  async getConfig(now = new Date()): Promise<TranslationConfigView> {
    const cfg = await this.readRaw();
    const periodKey = this.currentPeriodKey(now);
    const samePeriod = cfg?.periodKey === periodKey;
    const charsUsed = samePeriod ? Number(cfg?.charsUsed ?? 0) : 0;
    const limit = Number(cfg?.monthlyCharLimit ?? DEFAULT_MONTHLY_CHAR_LIMIT);
    return {
      provider: 'gtx',
      keyRequired: false,
      monthlyCharLimit: limit,
      charsUsedThisPeriod: charsUsed,
      remainingChars: Math.max(0, limit - charsUsed),
      periodKey,
    };
  }

  async saveConfig(input: {
    monthlyCharLimit?: number;
  }): Promise<TranslationConfigView> {
    const existing = (await this.readRaw()) ?? {};
    const periodKey = this.currentPeriodKey();
    const samePeriod = existing.periodKey === periodKey;

    const next = {
      charsUsed: samePeriod ? Number(existing.charsUsed ?? 0) : 0,
      periodKey,
      monthlyCharLimit:
        input.monthlyCharLimit ??
        Number(existing.monthlyCharLimit ?? DEFAULT_MONTHLY_CHAR_LIMIT),
    };

    await this.prisma.providerConfig.upsert({
      where: {
        module_provider: {
          module: TRANSLATION_PROVIDER_MODULE,
          provider: TRANSLATION_PROVIDER_NAME,
        },
      },
      create: {
        module: TRANSLATION_PROVIDER_MODULE,
        provider: TRANSLATION_PROVIDER_NAME,
        enabled: true,
        encryptedConfig: JSON.stringify(next),
      },
      update: { enabled: true, encryptedConfig: JSON.stringify(next) },
    });
    return this.getConfig();
  }
}
