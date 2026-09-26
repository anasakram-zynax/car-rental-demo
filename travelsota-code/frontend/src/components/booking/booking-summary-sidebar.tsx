'use client';

import { Button } from '@/components/ui/button';
import { useCurrency } from '@/context/CurrencyContext';

interface PriceLineProps {
  label: string;
  amount: number;
  currency: string;
  muted?: boolean;
  bold?: boolean;
  className?: string;
}

function PriceLine({ label, amount, currency, muted, bold, className = '' }: PriceLineProps) {
  const { formatPrice } = useCurrency();
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <span className={`text-sm ${muted ? 'text-zinc-400' : bold ? 'font-bold text-zinc-900' : 'text-zinc-600'}`}>
        {label}
      </span>
      <span className={`text-sm ${muted ? 'text-zinc-400' : bold ? 'font-bold text-zinc-900' : 'text-zinc-700'}`}>
        {formatPrice(amount, currency)}
      </span>
    </div>
  );
}

export interface BookingSummaryItem {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface PriceBreakdownLine {
  label: string;
  amount: number;
  muted?: boolean;
  bold?: boolean;
}

interface BookingSummarySidebarProps {
  title?: string;
  summary?: BookingSummaryItem[];
  priceLines?: PriceBreakdownLine[];
  currency?: string;
  ctaLabel?: string;
  onCta?: () => void;
  ctaLoading?: boolean;
  ctaDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  extra?: React.ReactNode;
}

export function BookingSummarySidebar({
  title = 'Booking Summary',
  summary,
  priceLines,
  currency = 'USD',
  ctaLabel,
  onCta,
  ctaLoading,
  ctaDisabled,
  secondaryLabel,
  onSecondary,
  extra,
}: BookingSummarySidebarProps) {
  return (
    <div className="border border-zinc-200 bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200 px-5 py-4">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em]">{title}</h3>
      </div>

      {/* Summary rows */}
      {summary && summary.length > 0 ? (
        <div className="border-b border-zinc-100 px-5 py-4 space-y-3">
          {summary.map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 uppercase tracking-wider">{item.label}</span>
              <span className={`text-xs font-semibold ${item.highlight ? 'text-zinc-900' : 'text-zinc-700'}`}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Price breakdown */}
      {priceLines && priceLines.length > 0 ? (
        <div className="px-5 py-4 space-y-2.5">
          {priceLines.map((line, i) => (
            <PriceLine key={i} {...line} currency={currency} />
          ))}

          {priceLines.length > 1 ? (
            <div className="border-t border-zinc-900 pt-3 mt-3">
              {(() => {
                const total = priceLines.reduce((sum, l) => sum + (l.muted ? 0 : l.amount), 0);
                return (
                  <PriceLine label="Total" amount={total} currency={currency} bold />
                );
              })()}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Extra content */}
      {extra ? (
        <div className="border-t border-zinc-100 px-5 py-3">{extra}</div>
      ) : null}

      {/* CTA */}
      {(ctaLabel || secondaryLabel) ? (
        <div className="border-t border-zinc-200 px-5 py-4 space-y-3">
          {ctaLabel ? (
            <Button
              onClick={onCta}
              loading={ctaLoading}
              disabled={ctaDisabled}
              size="lg"
              className="w-full"
            >
              {ctaLabel}
            </Button>
          ) : null}
          {secondaryLabel ? (
            <button
              onClick={onSecondary}
              className="block w-full text-center text-sm text-zinc-400 transition hover:text-zinc-600"
            >
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
