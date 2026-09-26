import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { GtxTranslateApiClient } from '../../infrastructure/gtx-translate-api';

export const TRANSLATION_PROVIDER_MODULE = 'i18n';
export const TRANSLATION_PROVIDER_NAME = 'gtx';
export const DEFAULT_MONTHLY_CHAR_LIMIT = 500_000;

export interface GenerateTranslationsInput {
  sourceContent: Record<string, unknown>;
}

export interface TranslationWarning {
  namespace: string;
  key: string;
  reason: string;
}

// ponytail: no key needed (gtx). ProviderConfig row tracks char usage only.
// Per-key requests + 250ms throttle (legacy parity) — ~4 min for 705 keys,
// admin-triggered only, zero public-traffic impact.
@Injectable()
export class TranslationGeneratorService {
  private readonly logger = new Logger(TranslationGeneratorService.name);
  private readonly THROTTLE_MS = 250;
  // ponytail: substring terms that must survive translation verbatim
  private readonly brandTerms = [
    'TravelsOTA',
    'Stripe',
    'PayPal',
    'Hotelbeds',
    'Travelport',
    'PNR',
    '3D Secure',
  ];

  constructor(private readonly prisma: PrismaService) {}

  private currentPeriodKey(now = new Date()): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private async addCharsUsed(chars: number): Promise<void> {
    const row = await this.prisma.providerConfig.findUnique({
      where: {
        module_provider: {
          module: TRANSLATION_PROVIDER_MODULE,
          provider: TRANSLATION_PROVIDER_NAME,
        },
      },
    });
    const periodKey = this.currentPeriodKey();
    const cfg = row
      ? (JSON.parse(row.encryptedConfig) as Record<string, unknown>)
      : {};
    const samePeriod = cfg.periodKey === periodKey;
    const next = JSON.stringify({
      ...cfg,
      charsUsed: ((samePeriod ? Number(cfg.charsUsed) : 0) || 0) + chars,
      periodKey,
    });
    if (row) {
      await this.prisma.providerConfig.update({
        where: {
          module_provider: {
            module: TRANSLATION_PROVIDER_MODULE,
            provider: TRANSLATION_PROVIDER_NAME,
          },
        },
        data: { encryptedConfig: next },
      });
    } else {
      await this.prisma.providerConfig.create({
        data: {
          module: TRANSLATION_PROVIDER_MODULE,
          provider: TRANSLATION_PROVIDER_NAME,
          enabled: true,
          encryptedConfig: next,
        },
      });
    }
  }

  // ponytail: gtx translates {name} -> {الاسم}. Shield placeholders as
  // __P0__ tokens before send, restore after. Tokens rarely translated.
  private shield(text: string): { shielded: string; tokens: string[] } {
    const tokens: string[] = [];
    const shielded = text.replace(/\{[^{}]+\}/g, (m) => {
      tokens.push(m);
      return `__P${tokens.length - 1}__`;
    });
    return { shielded, tokens };
  }

  private unshield(text: string, tokens: string[]): string | null {
    let out = text;
    for (let i = 0; i < tokens.length; i++) {
      if (!out.includes(`__P${i}__`)) return null;
      out = out.replace(`__P${i}__`, tokens[i]);
    }
    return out;
  }

  private tags(text: string): string[] {
    const found: RegExpMatchArray | null = text.match(/<\/?[a-zA-Z][^>]*>/g);
    const list: string[] = found ? [...found] : [];
    return list.map((t: string) => t.toLowerCase()).sort();
  }

  private sameTags(source: string, translated: string): boolean {
    const a = this.tags(source);
    const b = this.tags(translated);
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  private brandsDropped(source: string, translated: string): string[] {
    return this.brandTerms.filter(
      (term) =>
        source.toLowerCase().includes(term.toLowerCase()) &&
        !translated.toLowerCase().includes(term.toLowerCase()),
    );
  }

  async generateTranslations(
    languageCode: string,
    languageName: string,
    input: GenerateTranslationsInput,
  ): Promise<{
    fileCount: number;
    keys: number;
    content: Record<string, unknown>;
    warnings: TranslationWarning[];
    charsUsed: number;
  }> {
    if (!input.sourceContent || Object.keys(input.sourceContent).length === 0) {
      throw new Error('sourceContent is required and must not be empty');
    }

    const client = new GtxTranslateApiClient();
    this.logger.log(`Generating ${languageCode} translations via gtx...`);

    const content: Record<string, unknown> = {};
    const warnings: TranslationWarning[] = [];
    let charsUsed = 0;

    for (const ns of Object.keys(input.sourceContent)) {
      const nsSource = input.sourceContent[ns] as Record<string, string>;
      const out: Record<string, string> = {};

      for (const key of Object.keys(nsSource)) {
        const source = nsSource[key];
        const { shielded, tokens } = this.shield(source);
        const { translated } = await client.translateText(
          shielded,
          languageCode,
        );
        charsUsed += source.length;

        const restored =
          translated === null ? null : this.unshield(translated, tokens);
        if (restored === null) {
          out[key] = source;
          warnings.push({
            namespace: ns,
            key,
            reason: translated === null ? 'request failed' : 'placeholder lost',
          });
        } else {
          const dropped = this.brandsDropped(source, restored);
          if (!this.sameTags(source, restored) || dropped.length > 0) {
            out[key] = source; // fallback English, never broken markup
            warnings.push({
              namespace: ns,
              key,
              reason:
                dropped.length > 0
                  ? `dropped brand: ${dropped.join(', ')}`
                  : 'html tag mismatch',
            });
          } else {
            out[key] = restored;
          }
        }

        await new Promise((r) => setTimeout(r, this.THROTTLE_MS));
      }
      content[ns] = out;
    }

    // ponytail: usage tracking best-effort — never fail translations over counter
    try {
      await this.addCharsUsed(charsUsed);
    } catch (err) {
      this.logger.warn(`Char counter write failed, translations unaffected: ${(err as Error).message}`);
    }

    let keyCount = 0;
    for (const ns of Object.values(content)) {
      if (typeof ns === 'object') keyCount += Object.keys(ns as object).length;
    }
    this.logger.log(
      `Translations generated: ${Object.keys(content).length} namespaces, ${keyCount} keys`,
    );
    return {
      fileCount: Object.keys(content).length,
      keys: keyCount,
      content,
      warnings,
      charsUsed,
    };
  }

  async testConnection(): Promise<{
    ok: boolean;
    translated: string;
    chars: number;
  }> {
    const client = new GtxTranslateApiClient();
    const { translated, chars } = await client.translateText('Hello', 'ar');
    if (translated === null) {
      throw new Error(
        'gtx endpoint unreachable or throttled. Retry in a minute.',
      );
    }
    try {
      await this.addCharsUsed(chars);
    } catch (err) {
      this.logger.warn(
        `Char counter write failed, probe unaffected: ${(err as Error).message}`,
      );
    }
    return { ok: true, translated, chars };
  }
}
