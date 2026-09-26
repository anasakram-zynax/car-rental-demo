"use client";
import { useTranslations } from 'next-intl';


import { motion } from "motion/react";
import { useCurrency } from "@/context/CurrencyContext";
import { Badge } from "@/components/ui/badge";
import { SupplierGate } from "@/components/shared/supplier-gate";
import type { EnrichedRate } from "../../api/get-hotel-details";
import { getCancellationPolicyView } from "@/lib/utils/cancellation-policy";

interface RateCardProps {
  rate: EnrichedRate;
  isSelected: boolean;
  nights: number;
  onSelect: (rateId: string) => void;
}

export function RateCard({
  rate,
  isSelected,
  nights,
  onSelect,
}: RateCardProps) {
  const t = useTranslations('Checkout');
  const { formatPrice } = useCurrency();
  // Prefer the backend's marked-up + display-converted pricing block, then
  // the marked customerPrice — raw supplierPrice is a last resort only.
  const displayPrice = rate.pricing?.displayPrice ?? rate.customerPrice ?? rate.supplierPrice;
  // Rate amounts are STAY totals (all nights) — never multiply by nights again.
  const total = displayPrice.amount;
  const perNight = nights > 1 ? displayPrice.amount / nights : displayPrice.amount;
  const cancellationView = getCancellationPolicyView(rate, displayPrice.currency);

  // Compute badge directly from raw policies — most reliable approach
  const policies = rate.cancellationPolicies ?? [];
  const now = Date.now();

  // Check if any policy has a fee with a future deadline (= currently free)
  const hasFutureFee = policies.some((p) => {
    const amount = Number(p.amount ?? 0);
    const pct = Number(p.percentage ?? 0);
    const nights = Number(p.numberOfNights ?? 0);
    const hasFee = amount > 0 || pct > 0 || nights > 0;
    const deadline = p.from ?? p.deadline;
    if (!deadline || !hasFee) return false;
    const d = new Date(deadline);
    return Number.isFinite(d.getTime()) && d.getTime() > now;
  });

  // Check if any policy is zero-fee with a future deadline (= currently free)
  const hasFutureFree = policies.some((p) => {
    const amount = Number(p.amount ?? 0);
    const pct = Number(p.percentage ?? 0);
    const nights = Number(p.numberOfNights ?? 0);
    const isZero = amount === 0 && pct === 0 && nights === 0;
    if (!isZero) return false;
    const deadline = p.from ?? p.deadline;
    if (!deadline) return true;
    const d = new Date(deadline);
    return Number.isFinite(d.getTime()) && d.getTime() > now;
  });

  // All policies have fees = non-refundable
  const allHaveFees = policies.length > 0 && policies.every((p) => {
    const amount = Number(p.amount ?? 0);
    const pct = Number(p.percentage ?? 0);
    const nights = Number(p.numberOfNights ?? 0);
    return amount > 0 || pct > 0 || nights > 0;
  });

  // Badge: free if any future free period exists, non-refundable if all fees, else fee applies
  const isCurrentlyFree = hasFutureFee || hasFutureFree || rate.refundable === true;
  const isNonRefundable = allHaveFees && !hasFutureFee && !hasFutureFree;

  // Fallback: check description text for "Free until" (in case policies are empty but description is correct)
  const descText = (cancellationView.description ?? '').toLowerCase();
  const descSaysFree = descText.includes('free until') || descText.startsWith('free cancellation');

  // Also check the raw cancellationPolicy text field (backend-formatted)
  // Format: "Cancellation: 82.20 from 2026-08-21T12:00:00+04:00"
  // or "Free cancellation until ..." or similar
  const rawPolicyText = rate.cancellationPolicy ?? '';
  const rawPolicySaysFree = rawPolicyText.toLowerCase().includes('free') && !rawPolicyText.toLowerCase().includes('non');

  // Parse deadline from raw text: "from 2026-08-21T12:00:00+04:00"
  const fromMatch = rawPolicyText.match(/from\s+(\d{4}-\d{2}-\d{2}T[\d:+-]+)/i);
  const rawDeadline = fromMatch?.[1];
  const rawDeadlineFuture = rawDeadline ? (() => {
    const d = new Date(rawDeadline);
    return Number.isFinite(d.getTime()) && d.getTime() > now;
  })() : false;

  // Parse amount from raw text: "Cancellation: 82.20"
  const amountMatch = rawPolicyText.match(/(?:cancellation|fee)[:\s]*(\d+\.?\d*)/i);
  const rawHasFee = amountMatch ? Number(amountMatch[1]) > 0 : false;

  // If raw text has a deadline in the future with a fee → currently free
  const rawTextSaysFree = rawDeadlineFuture && rawHasFee;

  const finalFree = isCurrentlyFree || descSaysFree || rawPolicySaysFree || rawTextSaysFree;

  // Build display description with currency
  const currency = displayPrice.currency;
  const buildDescription = (): string => {
    // Prefer computed description from getCancellationPolicyView
    if (cancellationView.description) {
      // Add currency to fee amounts in the description
      return cancellationView.description.replace(
        /(?:a fee of |fee of )(\d+\.?\d*)/g,
        (_, amt) => `a fee of ${formatPrice(Number(amt), currency)}`,
      ).replace(
        /Cancellation fee: (\d+\.?\d*)/,
        (_, amt) => `Cancellation fee: ${formatPrice(Number(amt), currency)}`,
      );
    }
    // Fallback: build from raw text
    if (rawPolicyText && rawDeadline) {
      const feeAmount = rawPolicyText.match(/(?:cancellation|fee)[:\s]*(\d+\.?\d*)/i)?.[1];
      const formattedFee = feeAmount ? formatPrice(Number(feeAmount), currency) : 'applies';
      return `Free cancellation until ${new Date(rawDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}. After that, a fee of ${formattedFee} will apply.`;
    }
    return cancellationView.description || rawPolicyText || '';
  };

  const description = buildDescription();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col gap-3 px-5 py-3.5 transition-colors duration-200 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${
        isSelected
          ? "bg-brand-teal/5"
          : "hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
      } border-t border-brand-teal/5 first:border-t-0 dark:border-white/5`}
    >
      {/* Left: badges & info */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
        {finalFree ? (
          <Badge variant="success" className="gap-1">
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.4}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
            Free cancellation
          </Badge>
        ) : isNonRefundable ? (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-[#7d7d7d] dark:bg-white/8 dark:text-gray-400">
            Non-refundable
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            Cancellation fee applies
          </span>
        )}

        {rate.boardName && (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#545454] dark:text-gray-300">
            <svg
              className="h-3.5 w-3.5 text-brand-teal"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.6}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
            {rate.boardName}
          </span>
        )}

        {description && (
          <div className="w-full mt-1">
            <span className="inline-flex items-center gap-1 text-[11px] leading-relaxed text-[#7d7d7d] dark:text-gray-500">
              <svg
                className="h-3 w-3 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <span>{description}</span>
            </span>
          </div>
        )}

        <SupplierGate>
        <span className="text-[11px] text-[#7d7d7d] dark:text-gray-500">
          via{" "}
          {rate.provider === "hotelbeds"
            ? "Hotelbeds"
            : rate.provider === "ratehawk"
              ? "RateHawk"
              : rate.provider}
        </span>
        </SupplierGate>
      </div>

      {/* Right: price + CTA */}
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums text-charcoal dark:text-white">
            {formatPrice(perNight, displayPrice.currency)}
            <span className="text-[11px] font-normal text-[#7d7d7d]">
              {" "}
              / night
            </span>
          </p>
          <p className="text-[11px] text-[#7d7d7d] dark:text-gray-500">
            {formatPrice(total, displayPrice.currency)} total
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(rate.rateId)}
          className={`shrink-0 cursor-pointer rounded-xl px-5 py-2 text-sm font-bold transition-all duration-200 active:scale-[0.97] ${
            isSelected
              ? "bg-brand-teal text-white shadow-[0_8px_20px_rgba(3,61,74,0.28)]"
              : "border border-brand-teal/25 text-brand-teal hover:border-brand-teal hover:bg-brand-teal/5"
          }`}
        >
          {isSelected ? "Selected" : "Select"}
        </button>
      </div>
    </motion.div>
  );
}
