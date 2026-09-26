/**
 * Currencies PayPal's REST API actually accepts (Checkout/Orders v2, as of
 * PayPal's published currency support docs). Notably excludes ISO 4217's
 * three-decimal currencies (BHD, JOD, KWD, OMR, TND) — PayPal doesn't support
 * them at all. Sending one fails at the gateway with a raw, confusing error
 * at the worst possible moment: payment submission.
 */
const PAYPAL_SUPPORTED_CURRENCIES = new Set([
  'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'ILS',
  'JPY', 'MYR', 'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'RUB',
  'SGD', 'SEK', 'CHF', 'THB', 'USD',
]);

/** Stripe supports far more currencies; the one hard exclusion category is
 *  ISO 4217 codes it doesn't recognize at all — not modeled here since our
 *  admin-configured Currency table is the practical source of truth for
 *  "does this currency exist," and Stripe's rejection (if any) surfaces
 *  clearly from the gateway itself rather than silently mislabeling amounts. */

export function isGatewayCurrencySupported(gateway: string, currencyCode: string): boolean {
  const code = currencyCode.toUpperCase();
  if (gateway.toLowerCase() === 'paypal') {
    return PAYPAL_SUPPORTED_CURRENCIES.has(code);
  }
  return true;
}
