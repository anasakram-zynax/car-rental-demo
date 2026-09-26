/**
 * Shared pricing types used across all booking modules (flights, hotels, cars).
 *
 * Core Rule: Backend is the source of truth for conversion and final payable amount.
 * Frontend renders backend-provided displayPrice — it never invents payment amounts.
 */

/** A monetary amount with its currency code */
export interface Money {
  amount: number;
  currency: string;
}

/** Exchange rate snapshot captured at conversion time */
export interface ExchangeRateSnapshot {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  source: 'admin' | 'api' | 'cached';
  capturedAt: string;
}

/**
 * The canonical pricing breakdown for any bookable product.
 *
 * - `supplierPrice`: Raw provider quote (e.g. Travelport/Duffel/Hotelbeds amount)
 * - `displayPrice`:  Converted to user-selected header currency (what the user sees)
 * - `chargePrice`:   Actual payment gateway charge (may differ from display)
 */
export interface PricingBreakdown {
  supplierPrice: Money;
  displayPrice: Money;
  chargePrice: Money;
  exchangeRateSnapshot?: ExchangeRateSnapshot;
}

/** Input for buildPricingBreakdown */
export interface BuildPricingBreakdownInput {
  supplierAmount: number;
  supplierCurrency: string;
  displayCurrency: string;
  /** If omitted, defaults to supplierCurrency */
  chargeCurrency?: string;
}
