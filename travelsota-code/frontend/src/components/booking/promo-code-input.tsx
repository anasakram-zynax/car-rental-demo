'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import { apiRequest } from '@/lib/api/client';
import { formatCurrency } from '@/lib/utils/currency';

interface PromoQuoteResult {
  code: string;
  name: string;
  discountType: string;
  discountMinor: number;
  finalAmountMinor: number;
  currency: string;
  minBookingAmountMinor: number;
}

interface PromoCodeInputProps {
  productType: 'flights' | 'hotels';
  context?: {
    routeCode?: string;
    airlineCode?: string;
    cabinClass?: string;
    hotelId?: string;
    destinationCode?: string;
    providerKey?: string;
  };
  onPromoApplied: (promo: {
    code: string;
    discountMinor: number;
    finalAmountMinor: number;
    currency: string;
  }) => void;
  onPromoRemoved: () => void;
}

export function PromoCodeInput({
  productType,
  context,
  onPromoApplied,
  onPromoRemoved,
}: PromoCodeInputProps) {
  const [code, setCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoQuoteResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const toast = useToast();
  const tCheckout = useTranslations('Checkout');
  const tHotels = useTranslations('Hotels');

  const quoteMutation = useMutation({
    mutationFn: (promoCode: string) =>
      apiRequest<PromoQuoteResult>('/promo-codes/quote', {
        method: 'POST',
        body: {
          code: promoCode,
          productType,
          ...context,
        },
      }),
    onSuccess: (data) => {
      setAppliedPromo(data);
      setErrorMessage(null);
      onPromoApplied({
        code: data.code,
        discountMinor: data.discountMinor,
        finalAmountMinor: data.finalAmountMinor,
        currency: data.currency,
      });
      toast.success(tCheckout('promoAppliedTitle'), tCheckout('promoSavedDesc', { amount: formatMinorAmount(data.discountMinor, data.currency) }));
    },
    onError: (error: { message?: string }) => {
      setAppliedPromo(null);
      const msg = error?.message ?? tCheckout('promoInvalidFallback');
      setErrorMessage(msg);
      toast.error(tCheckout('promoFailedTitle'), msg);
    },
  });

  function handleApply() {
    if (!code.trim()) return;
    setErrorMessage(null);
    quoteMutation.mutate(code.trim());
  }

  function handleRemove() {
    setAppliedPromo(null);
    setCode('');
    setErrorMessage(null);
    onPromoRemoved();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    }
  }

  if (appliedPromo) {
    return (
      <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
              <svg
                className="h-3.5 w-3.5 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                {appliedPromo.name || appliedPromo.code}
              </p>
              <p className="text-xs text-emerald-600">
                {tHotels('promoOffAmount', { amount: formatMinorAmount(appliedPromo.discountMinor, appliedPromo.currency) })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="text-xs font-medium text-zinc-500 transition hover:text-red-600 cursor-pointer"
          >
            {tCheckout('removeAction')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label={tCheckout('promoCodeLabel')}
            placeholder={tCheckout('promoCodePlaceholder')}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (errorMessage) setErrorMessage(null);
            }}
            onKeyDown={handleKeyDown}
            error={errorMessage ?? undefined}
            className="text-xs uppercase tracking-wider placeholder:text-zinc-400 placeholder:normal-case placeholder:tracking-normal"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleApply}
          disabled={!code.trim() || quoteMutation.isPending}
          loading={quoteMutation.isPending}
          className="shrink-0"
        >
          {tCheckout('promoApplyButton')}
        </Button>
      </div>
    </div>
  );
}

function formatMinorAmount(minorAmount: number, currency: string): string {
  const CURRENCY_MINOR_UNITS: Record<string, number> = {
    KWD: 3, BHD: 3, OMR: 3, TND: 3, JOD: 3,
    JPY: 0, KRW: 0, CLP: 0, ISK: 0,
  };
  const unit = CURRENCY_MINOR_UNITS[currency?.toUpperCase()] ?? 2;
  const amount = minorAmount / Math.pow(10, unit);
  return formatCurrency(amount, currency);
}
