'use client';

import { useTranslations } from 'next-intl';
import type { MarkedUpOffer } from '@/features/agent/api/agent-bookings';
import { formatCurrencyWithCode } from '@/lib/utils/currency';
import { useCurrencyData } from '@/context/CurrencyContext';

// ─── Inline Tag Icon ─────────────────────────────────────

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

// ─── Markup Tooltip ──────────────────────────────────────

interface MarkupTooltipProps {
  markups: MarkedUpOffer;
  currency: string;
  show: boolean;
  onClose: () => void;
}

function MarkupTooltip({ markups, currency, show, onClose }: MarkupTooltipProps) {
  const { decimalsMap } = useCurrencyData();
  const t = useTranslations('Flights');
  const tc = useTranslations('Common');
  if (!show) return null;
  const fmt = (n: number) => formatCurrencyWithCode(n, currency, decimalsMap);
  return (
    <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('agentPriceBreakdown')}</p>
      <div className="mt-2 space-y-1.5">
        <div className="flex justify-between text-xs text-gray-500">
          <span>{t('supplierPriceLabel')}</span>
          <span>{fmt(markups.originalPrice)}</span>
        </div>
        {markups.appliedRules.map((rule, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-gray-500">{rule.name}</span>
            <span className="text-brand-600 dark:text-brand-400">+{fmt(rule.markupAmount)}</span>
          </div>
        ))}
        <div className="border-t border-gray-100 pt-2 dark:border-gray-700">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-gray-900 dark:text-white">{t('agentPriceLabel')}</span>
            <span className="text-brand-600 dark:text-brand-400">{fmt(markups.markedUpPrice)}</span>
          </div>
        </div>
      </div>
      <button
        onClick={onClose}
        className="mt-2 w-full cursor-pointer rounded-lg bg-brand-teal/5 py-1.5 text-xs font-medium text-brand-teal transition hover:bg-brand-teal/10"
      >
        {tc('close')}
      </button>
    </div>
  );
}

// ─── Markup Button ───────────────────────────────────────

interface MarkupButtonProps {
  markups: MarkedUpOffer;
  currency: string;
  showMarkup: boolean;
  onToggle: () => void;
}

export function MarkupButton({ markups, currency, showMarkup, onToggle }: MarkupButtonProps) {
  const t = useTranslations('Flights');
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="inline-flex cursor-pointer items-center gap-1 text-xs text-brand-teal/60 hover:text-brand-teal"
      >
        <TagIcon className="size-3.5" />
        {t('agentPriceWithPercent', { percent: markups.markupPercent.toFixed(1) })}
      </button>
      <MarkupTooltip
        markups={markups}
        currency={currency}
        show={showMarkup}
        onClose={onToggle}
      />
    </div>
  );
}
