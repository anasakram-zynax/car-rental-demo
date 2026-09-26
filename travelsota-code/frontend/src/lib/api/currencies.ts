import { apiRequest } from './client';

export interface PublicCurrencyDto {
  code: string;
  symbol: string;
  name: string;
  exchangeRate: number;
  decimals: number;
  isDefault: boolean;
}

/**
 * Fetch active currencies from the public backend endpoint.
 * This endpoint does not require authentication.
 */
export function fetchActiveCurrencies() {
  return apiRequest<PublicCurrencyDto[]>('/currencies');
}
