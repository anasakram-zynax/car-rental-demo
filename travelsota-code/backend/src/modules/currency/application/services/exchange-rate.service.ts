import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ExchangeRateApiClient } from '../../infrastructure/exchange-rate-api';

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiClient: ExchangeRateApiClient,
  ) {}

  /**
   * Update exchange rates for ALL currencies from the third-party API.
   * The rates are fetched relative to the base currency and stored in the DB.
   * Returns the count of updated currencies.
   */
  async updateAllRates(source: 'manual' | 'api' | 'cron' = 'manual'): Promise<{ updated: number; baseCurrency: string }> {
    const baseCurrency = await this.prisma.currency.findFirst({ where: { isBase: true } });
    if (!baseCurrency) {
      throw new Error('No base currency configured. Set a base currency first.');
    }

    this.logger.log(`Updating rates via ${source} (base: ${baseCurrency.code})`);

    // Fetch rates from API relative to the base currency
    const apiRates = await this.apiClient.fetchRates(baseCurrency.code);

    // Get all active currencies from DB
    const currencies = await this.prisma.currency.findMany({
      where: { isActive: true },
    });

    // Independent rows — update in parallel, then write audits in one batch.
    // The previous version awaited update+audit per currency serially.
    const jobs: Array<Promise<{ baseCurrency: string; targetCurrency: string; rate: number; source: string }>> = [];
    for (const currency of currencies) {
      // The API returns rates relative to the base currency
      // e.g., if base=KWD, API returns USD: 3.25, EUR: 2.99, etc.
      const apiRate = apiRates[currency.code];

      if (apiRate !== undefined && currency.code !== baseCurrency.code) {
        jobs.push(
          (async () => {
            await this.prisma.currency.update({
              where: { id: currency.id },
              data: { exchangeRate: apiRate },
            });
            return {
              baseCurrency: baseCurrency.code,
              targetCurrency: currency.code,
              rate: apiRate,
              source,
            };
          })(),
        );
      }
    }
    const audits = await Promise.all(jobs);

    // Also log the base currency itself (rate = 1)
    await this.prisma.exchangeRateAudit.createMany({
      data: [
        ...audits,
        {
          baseCurrency: baseCurrency.code,
          targetCurrency: baseCurrency.code,
          rate: 1,
          source,
        },
      ],
    });

    const updatedCount = audits.length;

    this.logger.log(`Updated ${updatedCount} currencies via ${source}`);
    return { updated: updatedCount, baseCurrency: baseCurrency.code };
  }
}
