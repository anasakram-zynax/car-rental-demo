"use client";

import { useTranslations } from "next-intl";
import { useCurrencyData, useCurrency } from "@/context/CurrencyContext";
import { formatCurrency } from "@/lib/utils/currency";

// FlightRateComments — supplier rate policies ("Rate Comments") section.
// Displays cancellation, change, taxes, and other supplier-provided booking
// conditions with readable messages. Uses REAL supplier data when present;
// falls back to honest defaults ("confirmed at price check") when the
// supplier doesn't provide the field.

interface RateCondition {
  allowed?: boolean | null;
  penaltyAmount?: string | number | null;
  penaltyCurrency?: string | null;
  /** Penalty quoted as a share of the fare (0-100), when the supplier gives a percent. */
  penaltyPercent?: number | null;
  /** Authoritative "this is a genuine $0 fee" flag from the supplier
   *  normalizer. Only trust `free` tone when this is explicitly true —
   *  a missing penaltyAmount means the fee is unspecified, not zero. */
  free?: boolean | null;
}

export interface FlightRateCommentsData {
  provider?: string;
  refund?: RateCondition | null;
  change?: RateCondition | null;
  taxAmount?: string | number | null;
  taxCurrency?: string | null;
  taxes?: Array<{ amount?: string | number; currency?: string; name?: string }>;
  expiresAt?: string | null;
  fareRulesText?: string | null;
}

function useFormatMoney() {
  // Amounts here carry their own currency code (already converted upstream
  // by the mapper/snapshot service) — render as-is with the currency's real
  // decimals (JPY 0, KWD 3) instead of a hardcoded 2.
  const { decimalsMap } = useCurrencyData();
  return (amount: string | number | null | undefined, currency?: string | null): string => {
    const n = amount != null ? Number(amount) : NaN;
    if (!Number.isFinite(n)) return "";
    const code = (currency ?? "").toUpperCase();
    // No code: bare number, never assume USD.
    if (!code) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return formatCurrency(n, code, decimalsMap) + ` ${code}`;
  };
}

function conditionLabel(kind: "refund" | "change", condition: RateCondition | null | undefined, formatMoney: (amount: string | number | null | undefined, currency?: string | null) => string, t: (key: string, values?: Record<string, string | number>) => string): {
  label: string;
  detail: string;
  tone: "free" | "fee" | "none" | "unknown";
} {
  const label = kind === "refund" ? t('cancellationLabel') : t('changesLabel');
  if (!condition || condition.allowed == null) {
    return {
      label,
      detail: t('fareRulesPending'),
      tone: "unknown",
    };
  }
  if (!condition.allowed) {
    return {
      label,
      detail: kind === "refund" ? t('nonRefundable') : t('changesNotAllowed'),
      tone: "none",
    };
  }
  const penalty = formatMoney(condition.penaltyAmount, condition.penaltyCurrency);
  const pct = condition.penaltyPercent != null ? Number(condition.penaltyPercent) : NaN;
  if (!penalty && Number.isFinite(pct) && pct > 0) {
    return {
      label,
      detail: kind === "refund" ? t('cancelFeePercent', { percent: pct }) : t('changeFeePercent', { percent: pct }),
      tone: "fee",
    };
  }
  if (!penalty) {
    // A missing penalty amount does NOT mean the fee is zero — the
    // supplier may permit refund/change without disclosing a figure.
    // Only render "Free" when the normalizer explicitly confirmed a
    // genuine $0 penalty; otherwise be honest that the fee is unknown
    // rather than fabricating "free".
    if (condition.free === true) {
      return {
        label,
        detail: kind === "refund" ? t('freeCancellation') : t('freeChanges'),
        tone: "free",
      };
    }
    return {
      label,
      detail: kind === "refund" ? t('refundPermittedUndisclosed') : t('changesPermittedUndisclosed'),
      tone: "unknown",
    };
  }
  return {
    label,
    detail: kind === "refund" ? t('cancelFee', { fee: penalty }) : t('changeFee', { fee: penalty }),
    tone: "fee",
  };
}

const TONE_STYLES: Record<string, string> = {
  free: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  fee: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  none: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  unknown: "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400",
};

export function FlightRateComments({ data }: { data: FlightRateCommentsData }) {
  const t = useTranslations('Flights');
  const formatMoney = useFormatMoney();
  // Supplier penalties/taxes arrive in the supplier currency (e.g. Duffel
  // EUR) — convert into the selected display currency so fees never show raw
  // supplier amounts. Already-selected amounts pass through untouched.
  const { convertAmount, selectedCurrency } = useCurrency();
  const sel = selectedCurrency.code;
  const toSelected = (
    amount: string | number | null | undefined,
    currency?: string | null,
  ): { amount: string | number | null | undefined; currency?: string | null } => {
    const code = (currency ?? "").toUpperCase();
    const n = amount != null ? Number(amount) : NaN;
    if (!code || code === sel || !Number.isFinite(n)) return { amount, currency: code || currency };
    return { amount: convertAmount(n, code), currency: sel };
  };
  const refundSrc = data.refund ?? undefined;
  const changeSrc = data.change ?? undefined;
  const refundConv = refundSrc ? toSelected(refundSrc.penaltyAmount, refundSrc.penaltyCurrency) : null;
  const changeConv = changeSrc ? toSelected(changeSrc.penaltyAmount, changeSrc.penaltyCurrency) : null;
  const refund = conditionLabel(
    "refund",
    refundSrc ? { ...refundSrc, penaltyAmount: refundConv?.amount ?? null, penaltyCurrency: refundConv?.currency } : refundSrc,
    formatMoney,
    (k, v) => t(k, v),
  );
  const change = conditionLabel(
    "change",
    changeSrc ? { ...changeSrc, penaltyAmount: changeConv?.amount ?? null, penaltyCurrency: changeConv?.currency } : changeSrc,
    formatMoney,
    (k, v) => t(k, v),
  );
  const taxConv = toSelected(data.taxAmount, data.taxCurrency);
  const taxTotal = formatMoney(taxConv.amount, taxConv.currency);

  const taxesConv = (data.taxes ?? []).map((tax) => {
    const c = toSelected(tax.amount, tax.currency);
    return { ...tax, amount: c.amount, currency: c.currency ?? tax.currency };
  });

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-3">
        {t('rateCommentsTitle')}
      </h3>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{refund.label}</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${TONE_STYLES[refund.tone]}`}>
            {refund.detail}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{change.label}</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${TONE_STYLES[change.tone]}`}>
            {change.detail}
          </span>
        </div>
        {taxTotal && (
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('taxesLabel')}</span>
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{taxTotal}</span>
          </div>
        )}
        {taxesConv && taxesConv.length > 0 && (
          <div className="border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
              {t('taxBreakdown')}
            </p>
            <div className="space-y-1">
              {taxesConv.map((tax, i) => (
                <div key={i} className="flex items-start justify-between gap-3">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {tax.name ?? t('taxFallback')}
                  </span>
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {formatMoney(tax.amount, tax.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.expiresAt && (
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('fareHeldUntil')}</span>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {new Date(data.expiresAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
        {data.fareRulesText && (
          <div className="border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <p className="text-xs italic text-zinc-500 dark:text-zinc-400">{data.fareRulesText}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Build FlightRateCommentsData from a raw Duffel offer.
 * Uses the REAL supplier conditions — no fallback fabrication.
 */
export function duffelRateComments(offer: {
  conditions?: {
    refund_before_departure?: { allowed?: boolean | null; penalty_amount?: string | null; penalty_currency?: string | null } | null;
    change_before_departure?: { allowed?: boolean | null; penalty_amount?: string | null; penalty_currency?: string | null } | null;
  } | null;
  tax_amount?: string | null;
  tax_currency?: string | null;
  taxes?: Array<{ amount?: string | number; currency?: string; name?: string }>;
  expires_at?: string | null;
}): FlightRateCommentsData {
  const refund = offer.conditions?.refund_before_departure;
  const change = offer.conditions?.change_before_departure;
  return {
    provider: "duffel",
    refund: refund
      ? { allowed: refund.allowed, penaltyAmount: refund.penalty_amount, penaltyCurrency: refund.penalty_currency }
      : null,
    change: change
      ? { allowed: change.allowed, penaltyAmount: change.penalty_amount, penaltyCurrency: change.penalty_currency }
      : null,
    taxAmount: offer.tax_amount ?? null,
    taxCurrency: offer.tax_currency ?? null,
    taxes: offer.taxes ?? undefined,
    expiresAt: offer.expires_at ?? null,
  };
}
