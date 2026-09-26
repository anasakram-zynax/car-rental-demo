'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Landmark, Copy, Check, ShieldCheck, Info } from 'lucide-react';
import { PayLaterIcon } from './payment-method-icons';
import { cn } from '@/lib/cn';

interface BankDetails {
  enabled: boolean;
  accountTitle?: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  swiftCode?: string;
  instructions?: string;
}

/**
 * Bank account details for the Bank Transfer method at checkout.
 * Reads the admin-configured details (public endpoint, no secrets).
 * Falls back to a neutral notice when details are not configured yet.
 */
export function BankTransferDetails() {
  const tCheckout = useTranslations('Checkout');
  const [copied, setCopied] = useState<string | null>(null);
  const { data, isPending } = useApiQuery<BankDetails>(
    ['public', 'bank-transfer-details'],
    '/payments/config/bank_transfer',
    { staleTime: 300_000, retry: 1 },
  );

  if (isPending) {
    return <div className="h-24 animate-pulse rounded-xl bg-muted" aria-busy="true" />;
  }
  if (!data?.accountNumber && !data?.iban) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{tCheckout('bankDetailsPendingNotice')}</p>
      </div>
    );
  }

  const rows: Array<[string, string | undefined]> = [
    [tCheckout('bankAccountTitleLabel'), data.accountTitle],
    [tCheckout('bankNameLabel'), data.bankName],
    [tCheckout('bankAccountNumberLabel'), data.accountNumber],
    [tCheckout('bankIbanLabel'), data.iban],
    [tCheckout('bankSwiftLabel'), data.swiftCode],
  ];

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard unavailable — selection still works */
    }
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
  };

  return (
    <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <Landmark className="size-4.5" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">{tCheckout('bankTransferDetailsTitle')}</p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
            {tCheckout('bankTransferDetailsSubtitle')}
          </p>
        </div>
      </div>
      <dl className="mt-4 space-y-2.5 rounded-lg bg-white/70 p-3 dark:bg-white/5">
        {rows.map(([label, value]) =>
          value ? (
            <div key={label} className="flex items-center justify-between gap-3">
              <dt className="text-xs font-medium text-emerald-800/80 dark:text-emerald-300/80">{label}</dt>
              <dd className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold tabular-nums text-emerald-950 dark:text-emerald-100">
                  {value}
                </span>
                <button
                  type="button"
                  onClick={() => copy(label, value)}
                  aria-label={tCheckout('copyWithLabel', { label })}
                  className={cn(
                    'inline-flex size-7 cursor-pointer items-center justify-center rounded-lg transition-colors',
                    copied === label
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100 dark:bg-white/10 dark:text-emerald-200 dark:ring-white/10',
                  )}
                >
                  {copied === label ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </button>
              </dd>
            </div>
          ) : null,
        )}
      </dl>
      {data.instructions && (
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-emerald-900 dark:text-emerald-200">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{data.instructions}</span>
        </p>
      )}
    </div>
  );
}

/** Explains the Pay Later method: booking is held, pay inside the window. */
export function PayLaterInfo() {
  const tCheckout = useTranslations('Checkout');
  const { data } = useApiQuery<{ instructions?: string }>(
    ['public', 'pay-later-details'],
    '/payments/config/pay_later',
    { staleTime: 300_000, retry: 1 },
  );
  return (
    <div className="flex items-start gap-3 rounded-xl border border-sky-200/70 bg-sky-50/60 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white">
        <PayLaterIcon className="size-4.5" />
      </span>
      <div>
        <p className="text-sm font-bold text-sky-900 dark:text-sky-200">{tCheckout('payLaterInfoTitle')}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-sky-900/80 dark:text-sky-200/80">
          {data?.instructions || tCheckout('payLaterInfoFallback')}
        </p>
      </div>
    </div>
  );
}
