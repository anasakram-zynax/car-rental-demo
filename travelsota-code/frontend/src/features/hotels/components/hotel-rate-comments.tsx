"use client";

// HotelRateComments — dedicated "Rate Comments" box for hotel bookings.
// Shows cancellation policies (deadline + fee), modification rules, board,
// and room details in a clean, readable layout that matches the flight
// FlightRateComments component. Uses REAL supplier data when available.

import { useTranslations } from 'next-intl';
import { formatPolicyDate, getCancellationPolicyView } from '@/lib/utils/cancellation-policy';
import type { AggregatedPolicy } from '@/lib/schema/hotel';

interface PolicyData {
  amount?: string | number;
  /** Currency `amount` is denominated in — set by the backend's per-policy
   *  conversion (HotelDetailsOrchestratorService.convertCancellationPolicies). */
  currency?: string;
  from?: string;
  to?: string;
  deadline?: string;
  percentage?: string | number;
  numberOfNights?: number;
  policyType?: string;
}

export interface HotelRateCommentsData {
  provider?: string;
  boardName?: string;
  roomName?: string;
  refundable?: boolean;
  cancellationPolicies?: PolicyData[];
  cancellationPolicyText?: string;
  modificationAllowed?: boolean;
  /** Supplier rate comments / terms text (shown as-is). */
  rateComments?: string;
  /** Aggregated policy from backend — when provided, used for all display. */
  aggregatedPolicy?: AggregatedPolicy;
}

type TFn = (key: string, values?: Record<string, string | number>) => string;

function describePolicy(policy: PolicyData, t: TFn): { label: string; detail: string; tone: "free" | "fee" | "none" | "unknown" } {
  const deadline = policy.from ?? policy.deadline;
  const amount = Number(policy.amount ?? 0);
  const percentage = Number(policy.percentage ?? 0);
  const nights = Number(policy.numberOfNights ?? 0);
  const isZeroFee = amount === 0 && percentage === 0 && nights === 0;

  // Single policy with fee + deadline: "Free until {date}. After that, a fee of X will apply."
  if (!isZeroFee && deadline) {
    const date = formatPolicyDate(deadline);
    const feeText = amount > 0
      ? t('feeAmountApplies', { fee: policy.currency ? `${policy.currency} ${amount}` : `${amount}` })
      : percentage > 0
        ? t('feePercentApplies', { percent: percentage })
        : nights > 0
          ? t('nightsFeeApplies', { count: nights })
          : t('feeAppliesShort');
    return {
      label: t('cancellationLabel'),
      detail: t('cancellationFreeUntilWithFee', { date, fee: feeText }),
      tone: "fee",
    };
  }

  if (isZeroFee) {
    return {
      label: t('cancellationLabel'),
      detail: deadline
        ? t('cancellationFreeUntil', { date: formatPolicyDate(deadline) })
        : t('freeCancellation'),
      tone: "free",
    };
  }

  if (percentage === 100 || nights >= 99) {
    return {
      label: t('cancellationLabel'),
      detail: t('nonRefundable'),
      tone: "none",
    };
  }

  if (amount > 0) {
    return {
      label: t('cancellationLabel'),
      detail: t('feeAmount', { fee: policy.currency ? `${policy.currency} ${amount}` : `${amount}` }),
      tone: "fee",
    };
  }
  if (percentage > 0) {
    return {
      label: t('cancellationLabel'),
      detail: t('feeAmount', { fee: `${percentage}%` }),
      tone: "fee",
    };
  }
  if (nights > 0) {
    return {
      label: t('cancellationLabel'),
      detail: t('feeAmount', { fee: `${nights} night(s)` }),
      tone: "fee",
    };
  }
  return { label: t('cancellationLabel'), detail: t('cancellationFee'), tone: "unknown" };
}

function findUpcomingPolicy(policies: PolicyData[]): PolicyData | null {
  const now = new Date();
  const future = policies.filter((p) => {
    const d = p.from ?? p.deadline;
    if (!d) return false;
    const dt = new Date(d);
    const hasFee = Number(p.amount ?? 0) > 0 || Number(p.percentage ?? 0) > 0 || Number(p.numberOfNights ?? 0) > 0;
    return !isNaN(dt.getTime()) && dt.getTime() > now.getTime() && hasFee;
  });
  future.sort((a, b) => {
    const da = new Date(a.from ?? a.deadline ?? 0).getTime();
    const db = new Date(b.from ?? b.deadline ?? 0).getTime();
    return da - db;
  });
  return future[0] ?? null;
}

const TONE_STYLES: Record<string, string> = {
  free: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  fee: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  none: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  unknown: "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400",
};

export function HotelRateComments({ data }: { data: HotelRateCommentsData }) {
  const t = useTranslations('Hotels');
  const agg = data.aggregatedPolicy;

  // Use getCancellationPolicyView for consistent logic across all pages
  const cancellationView = getCancellationPolicyView({
    refundable: agg?.refundable ?? data.refundable,
    cancellationPolicies: data.cancellationPolicies as any,
    cancellationPolicyText: data.cancellationPolicyText,
  });

  const policies = data.cancellationPolicies ?? [];
  const primaryPolicy = policies.length > 0 ? describePolicy(policies[0], (k, v) => t(k, v)) : null;

  // Use aggregated displayText when available, otherwise use cancellationView.description
  const cancellationDetail = agg?.displayText || cancellationView.description || primaryPolicy?.detail || t('seeRates');

  // Tone from aggregated policy or cancellationView
  const cancellationTone = agg
    ? (agg.refundable ? "free" : agg.cancellationFee === 0 ? "free" : "fee")
    : cancellationView.isFree
      ? "free"
      : cancellationView.isNonRefundable
        ? "none"
        : cancellationView.label === "Cancellation policy"
          ? "unknown"
          : "fee";
  const rateComments = (agg?.rateComments || data.rateComments || "").trim();

  // Upcoming policy: use aggregated if available, otherwise compute from raw
  const upcoming = agg?.freeCancellationUntil && agg.cancellationFee
    ? null // aggregated already handles this in displayText
    : policies.length > 0 ? findUpcomingPolicy(policies) : null;

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-3">
        {t('rateCommentsTitle')}
      </h3>
      <div className="space-y-2">
        {/* Cancellation */}
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('cancellationLabel')}</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${TONE_STYLES[cancellationTone]}`}>
            {cancellationDetail}
          </span>
        </div>

        {/* Upcoming fee deadline — only show when main description doesn't already cover it */}
        {cancellationView.isFree && upcoming && !cancellationDetail.toLowerCase().includes('after that') && (() => {
          const desc = describePolicy(upcoming, (k, v) => t(k, v));
          return (
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('afterDeadline')}</span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${TONE_STYLES.fee}`}>
                {desc.detail}
              </span>
            </div>
          );
        })()}

        {rateComments && (
          <div className="border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <p className="whitespace-pre-line text-xs text-zinc-600 dark:text-zinc-300">{rateComments}</p>
          </div>
        )}

        {/* Modification */}
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('changesLabel')}</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
            (agg?.modificationAllowed ?? data.modificationAllowed) ? TONE_STYLES.free : TONE_STYLES.none
          }`}>
            {(agg?.modificationAllowed ?? data.modificationAllowed) ? t('modificationsAllowed') : t('notModifiable')}
          </span>
        </div>

        {/* Board + Room */}
        {data.boardName && (
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('board')}</span>
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {data.boardName}
            </span>
          </div>
        )}
        {data.roomName && (
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('roomLabel')}</span>
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {data.roomName}
            </span>
          </div>
        )}

        {/* Supplier note */}
        <div className="border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <p className="text-[10px] text-zinc-400">
            {t('suppliedByNote', {
              provider: data.provider === "hotelbeds"
                ? "Hotelbeds"
                : data.provider === "ratehawk"
                  ? "RateHawk"
                  : data.provider === "amadeus"
                    ? "Amadeus"
                    : data.provider === "travelport-stays"
                      ? "Travelport"
                      : (data.provider ?? "the supplier"),
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
