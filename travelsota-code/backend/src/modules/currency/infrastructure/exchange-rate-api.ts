import { Injectable, Logger } from '@nestjs/common';
import { HttpClientService } from '../../../shared/http/http-client.service';
import { AppConfigService } from '../../../shared/config/app-config.service';

export interface ExchangeRateApiResponse {
  result: 'success' | 'error';
  base_code: string;
  conversion_rates: Record<string, number>;
  error_type?: string;
}

@Injectable()
export class ExchangeRateApiClient {
  private readonly logger = new Logger(ExchangeRateApiClient.name);
  private readonly apiKey?: string;
  private readonly baseUrl: string;

  constructor(
    private readonly httpClient: HttpClientService,
    configService: AppConfigService,
  ) {
    this.apiKey = configService.currency.exchangeRateApiKey;
    this.baseUrl = configService.currency.exchangeRateApiUrl;
  }

  /**
   * Fetch latest exchange rates from the third-party API.
   * Rates are relative to the given base currency.
   */
  async fetchRates(baseCurrency: string): Promise<Record<string, number>> {
    if (!this.apiKey) {
      this.logger.warn('EXCHANGE_RATE_API_KEY not configured — using fallback rates');
      throw new Error('Exchange rate API key not configured');
    }

    const url = `${this.baseUrl}/${this.apiKey}/latest/${baseCurrency}`;

    this.logger.log(`Fetching exchange rates from API (base: ${baseCurrency})`);

    const response = await this.httpClient.request<ExchangeRateApiResponse>(url, {
      method: 'GET',
      responseType: 'json',
      timeoutMs: 15_000,
    });

    if (!response.ok || !response.data || (response.data as ExchangeRateApiResponse).result !== 'success') {
      const errorBody = response.data as ExchangeRateApiResponse;
      this.logger.error(`Exchange rate API error: ${errorBody?.error_type ?? 'unknown'}`);
      throw new Error(`Exchange rate API request failed: ${errorBody?.error_type ?? 'Unknown error'}`);
    }

    const data = response.data as ExchangeRateApiResponse;
    this.logger.log(`Received rates for ${Object.keys(data.conversion_rates).length} currencies`);

    return data.conversion_rates;
  }
}
