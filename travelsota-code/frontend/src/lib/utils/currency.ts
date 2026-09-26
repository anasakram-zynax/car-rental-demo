/**
 * Represents the dual-currency display state for any price in the UI.
 * - `displayAmount` / `displayCurrency` — what the user wants to see (converted)
 * - `chargeAmount` / `chargeCurrency` — what the supplier will actually charge
 */
export interface DisplayPriceInfo {
  displayAmount: number;
  displayCurrency: string;
  chargeAmount: number;
  chargeCurrency: string;
}

/**
 * Canonical pricing block — mirrors the backend PricingBreakdown type.
 * When present on a flight offer or hotel card, frontend should use
 * displayPrice directly instead of calling convertAmount().
 */
export interface PricingBlock {
  supplierPrice: { amount: number; currency: string };
  displayPrice: { amount: number; currency: string };
  chargePrice?: { amount: number; currency: string };
  exchangeRateSnapshot?: {
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    source: 'admin' | 'api' | 'cached';
    capturedAt: string;
  };
}

/**
 * Build a DisplayPriceInfo from the raw amount + charge currency.
 * When display and charge currencies differ, converts via `convertFn`.
 * When they match, all four fields are the same value.
 */
export function buildDisplayPrice(
  amount: number,
  chargeCurrency: string,
  displayCurrency: string,
  convertFn: (amount: number, fromCurrency: string) => number,
): DisplayPriceInfo {
  if (chargeCurrency.toUpperCase() === displayCurrency.toUpperCase()) {
    return { displayAmount: amount, displayCurrency, chargeAmount: amount, chargeCurrency };
  }
  return {
    displayAmount: convertFn(amount, chargeCurrency),
    displayCurrency,
    chargeAmount: amount,
    chargeCurrency,
  };
}

/**
 * LAST-RESORT fallback decimal places, used only when a live `decimalsMap`
 * (from `useCurrencyData().decimalsMap`, sourced from the admin-configured
 * `Currency.decimals` field) isn't available to the caller. Never trust this
 * over a live decimalsMap — it can't reflect currencies an admin has added
 * or reconfigured. Prefer passing `decimalsMap` from `CurrencyContext`.
 */
const FALLBACK_MINOR_UNITS: Record<string, number> = {
  KWD: 3,  BHD: 3,  OMR: 3,  TND: 3,  JOD: 3,
  JPY: 0,  KRW: 0,  CLP: 0,  ISK: 0,
  EUR: 2,  GBP: 2,  USD: 2,
  AED: 2,  SAR: 2,  QAR: 2,  PKR: 2,  INR: 2,  CNY: 2,
};

export function getCurrencyMinorUnit(currency: string, decimalsMap?: Record<string, number>): number {
  const code = currency?.toUpperCase();
  const fromLive = decimalsMap?.[code];
  if (fromLive != null) return fromLive;
  return FALLBACK_MINOR_UNITS[code] ?? 2;
}

/**
 * Resolve the display symbol for an ISO 4217 currency code.
 * Uses Intl.NumberFormat to get the correct symbol (e.g. "€" for EUR, "$" for USD, "PKR" for PKR).
 *
 * @example
 *   getCurrencySymbol('EUR') → '€'
 *   getCurrencySymbol('USD') → '$'
 *   getCurrencySymbol('PKR') → 'Rs' or 'PKR'  (locale-dependent)
 */
export function getCurrencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency?.toUpperCase(),
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const symbolPart = parts.find((p) => p.type === 'currency');
    return symbolPart?.value ?? currency?.toUpperCase() ?? '';
  } catch {
    return currency?.toUpperCase() ?? '';
  }
}

/**
 * Format a price with the correct symbol and decimal places for the given currency.
 * Does NOT perform any currency conversion — renders the amount as-is.
 *
 * @example
 *   formatCurrencyWithSymbol(256.6, 'KWD') → '256.600 KWD'
 *   formatCurrencyWithSymbol(25.99, 'USD') → '25.99 USD'
 */
export function formatCurrencyWithSymbol(amount: number, currency: string, decimalsMap?: Record<string, number>): string {
  const formatted = formatCurrency(amount, currency, decimalsMap);
  return `${formatted} ${(currency ?? '').toUpperCase()}`;
}

/**
 * Format a price amount for display with the correct number of decimal places
 * and locale-aware formatting.
 *
 * @example
 *   formatCurrency(256.6, 'KWD') → "256.600"
 *   formatCurrency(256.6, 'USD') → "256.60"
 *   formatCurrency(1200, 'JPY')  → "1,200"
 */
export function formatCurrency(amount: number, currency: string, decimalsMap?: Record<string, number>): string {
  const minorUnit = getCurrencyMinorUnit(currency, decimalsMap);
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: minorUnit,
    maximumFractionDigits: minorUnit,
  });
}

/**
 * Format price with currency symbol or code appended.
 *
 * @example
 *   formatCurrencyWithCode(256.6, 'KWD') → "256.600 KWD"
 *   formatCurrencyWithCode(25.99, 'USD') → "25.99 USD"
 */
export function formatCurrencyWithCode(amount: number, currency: string, decimalsMap?: Record<string, number>): string {
  return `${formatCurrency(amount, currency, decimalsMap)} ${(currency ?? '').toUpperCase()}`;
}
