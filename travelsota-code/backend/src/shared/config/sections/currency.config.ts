import { getBoolean, getString } from '../env.utils';

export interface CurrencyRuntimeConfig {
  exchangeRateApiKey?: string;
  exchangeRateApiUrl: string;
  autoUpdateEnabled: boolean;
  autoUpdateCron: string;
}

export function buildCurrencyConfig(
  env: NodeJS.ProcessEnv,
): CurrencyRuntimeConfig {
  return {
    exchangeRateApiKey: getString(env, 'EXCHANGE_RATE_API_KEY'),
    exchangeRateApiUrl:
      getString(env, 'EXCHANGE_RATE_API_URL') ??
      'https://v6.exchangerate-api.com/v6',
    autoUpdateEnabled: getBoolean(env, 'CURRENCY_AUTO_UPDATE_ENABLED', true),
    autoUpdateCron:
      getString(env, 'CURRENCY_UPDATE_CRON', '0 3 * * *') ?? '0 3 * * *',
  };
}
