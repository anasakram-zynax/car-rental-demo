import { useMemo } from 'react';
import { useCurrency, useCurrencyData } from '@/context/CurrencyContext';
import {
  formatCurrency,
  type PricingBlock,
} from '@/lib/utils/currency';

/**
 * Canonical price display component for TravelsOTA.
 *
 * Usage:
 *   <Money pricing={offer.pricing} />          — uses backend displayPrice
 *   <Money amount={120} currency="USD" />      — manual amount (legacy)
 *   <Money amount={120} currency="USD" strikethrough /> — crossed-out price
 *
 * When `pricing` is provided, it takes precedence.
 * Falls back to `amount` + `currency` + `useCurrency()` conversion.
 */

interface MoneyProps {
  /** Backend-computed pricing block (preferred) */
  pricing?: PricingBlock;
  /** Manual amount — used as fallback when pricing is absent */
  amount?: number;
  /** Manual currency — used as fallback when pricing is absent */
  currency?: string;
  /** Show a strikethrough (e.g. original price before discount) */
  strikethrough?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Render as a <span> (default) or another element */
  as?: 'span' | 'div' | 'p';
}

export default function Money({
  pricing,
  amount,
  currency,
  strikethrough = false,
  className = '',
  as: Tag = 'span',
}: MoneyProps) {
  const { convertAmount, selectedCurrency } = useCurrency();
  const { decimalsMap } = useCurrencyData();

  const display = useMemo(() => {
    // 1. Backend pricing block — the gold standard
    if (pricing?.displayPrice) {
      const { amount: amt, currency: cur } = pricing.displayPrice;
      return { amount: amt, currency: cur };
    }

    // 2. Manual amount + currency — convert via context rates
    if (amount != null && currency) {
      const converted = convertAmount(amount, currency);
      return { amount: converted, currency: selectedCurrency.code };
    }

    // 3. Nothing to show
    return null;
  }, [pricing, amount, currency, convertAmount, selectedCurrency.code]);

  if (!display) return null;

  const formatted = formatCurrency(display.amount, display.currency, decimalsMap);

  return (
    <Tag
      className={className}
      style={strikethrough ? { textDecoration: 'line-through' } : undefined}
    >
      {formatted} {display.currency}
    </Tag>
  );
}

/**
 * Helper: extract the display amount and currency from a pricing block,
 * falling back to manual amount/currency.
 */
export function getDisplayAmount(
  pricing?: PricingBlock,
  amount?: number,
  currency?: string,
): { amount: number; currency: string } | null {
  if (pricing?.displayPrice) {
    return { amount: pricing.displayPrice.amount, currency: pricing.displayPrice.currency };
  }
  if (amount != null && currency) {
    return { amount, currency };
  }
  return null;
}
