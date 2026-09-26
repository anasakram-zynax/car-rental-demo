'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/context/CurrencyContext';
import { getPriceBreakdownSetting } from '@/features/admin/api/admin-settings';

interface PriceBreakdownNoteProps {
  supplierAmount?: number | null;
  markupAmount?: number | null;
  total?: number | null;
  currency: string;
  label?: string;
}

/**
 * Admin/staff-only markup visibility. Renders nothing for agents, customers
 * or guests — they only ever see the final marked-up totals.
 *
 * Also respects the admin Price Breakdown toggle (Settings → General):
 * when OFF, no supplier/markup figures are rendered anywhere.
 */
export function PriceBreakdownNote({
  supplierAmount,
  markupAmount,
  total,
  currency,
  label,
}: PriceBreakdownNoteProps) {
  const tCheckout = useTranslations('Checkout');
  const tHotels = useTranslations('Hotels');
  const resolvedLabel = label ?? tCheckout('priceBreakdown');
  const { isAdmin } = useAuth();
  const { formatPrice } = useCurrency();
  const { data: breakdownSetting } = useQuery({
    queryKey: ['public', 'settings', 'price-breakdown'],
    queryFn: getPriceBreakdownSetting,
    staleTime: 60_000,
  });

  if (!isAdmin) return null;
  if (breakdownSetting != null && !breakdownSetting.showPriceBreakdown) return null;
  if (markupAmount == null || markupAmount <= 0) return null;

  return (
    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs dark:bg-emerald-900/20">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/70">
        {resolvedLabel}
      </p>
      {supplierAmount != null && (
        <div className="mt-0.5 flex items-center justify-between text-zinc-500">
          <span>{tHotels('supplierLabel')}</span>
          <span className="tabular-nums">{formatPrice(supplierAmount, currency)}</span>
        </div>
      )}
      <div className="flex items-center justify-between font-semibold text-emerald-700">
        <span>{tHotels('markupAppliedLabel')}</span>
        <span className="tabular-nums">+{formatPrice(markupAmount, currency)}</span>
      </div>
      {total != null && (
        <div className="mt-0.5 flex items-center justify-between border-t border-emerald-200/70 pt-1 font-bold text-zinc-900">
          <span>{tCheckout('total')}</span>
          <span className="tabular-nums">{formatPrice(total, currency)}</span>
        </div>
      )}
    </div>
  );
}
