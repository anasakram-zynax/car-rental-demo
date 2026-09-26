"use client";

// Single source of truth for cancellation policy display across the hotel
// detail page, booking detail page, and checkout. Every provider normalizes
// rates into `cancellationPolicies[]` + `refundable`; this derives a
// consistent { free / non-refundable / fee } verdict and human-readable text
// so the same rate reads the same on every page (and matches the cancel fee).

export interface CancellationPolicy {
  amount?: string | number;
  /** Currency `amount` is actually denominated in (set by the backend's
   *  per-policy conversion — see HotelDetailsOrchestratorService.convertCancellationPolicies).
   *  Falls back to the caller-supplied display currency only when absent. */
  currency?: string;
  from?: string;
  to?: string;
  deadline?: string;
  policyType?: string;
  percentage?: string | number;
  numberOfNights?: number;
}

export interface CancellationPolicyInput {
  refundable?: boolean;
  cancellationPolicies?: CancellationPolicy[];
  cancellationPolicyText?: string;
}

export interface CancellationPolicyView {
  isFree: boolean;
  isNonRefundable: boolean;
  /** Short badge label. */
  label: string;
  /** Long human-readable description (or null when unknown). */
  description: string | null;
}

/**
 * Format a supplier policy timestamp with proper timezone conversion to the
 * user's local time. Shows "Aug 17, 2026, 11:59 PM" with a timezone
 * abbreviation so the user sees their local deadline with context.
 */
export function formatPolicyDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Raw supplier time — no timezone conversion. Useful when the supplier's
 * deadline must be shown as-is (e.g. admin panels comparing to supplier data).
 */
export function formatPolicyDateRaw(value?: string): string {
  if (!value) return "";
  const str = String(value).trim();
  const datePart = str.slice(0, 10);
  const timePart = str.slice(11, 16);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return str;
  const [y, m, d] = datePart.split("-").map(Number);
  return timePart ? `${m}/${d}/${y}, ${timePart}` : `${m}/${d}/${y}`;
}

function isZero(p: CancellationPolicy): boolean {
  return (
    Number(p.amount ?? 0) === 0 &&
    Number(p.percentage ?? 0) === 0 &&
    Number(p.numberOfNights ?? 0) === 0
  );
}

function isFull(p: CancellationPolicy): boolean {
  return Number(p.percentage ?? 0) === 100 || Number(p.numberOfNights ?? 0) >= 99;
}

/** Check if a policy deadline is in the future (free cancellation still applies). */
function isDeadlineFuture(p: CancellationPolicy): boolean {
  const deadline = p.from ?? p.deadline;
  if (!deadline) return false;
  const d = new Date(deadline);
  return Number.isFinite(d.getTime()) && d.getTime() > Date.now();
}

function describePolicies(policies: CancellationPolicy[], currency?: string): string {
  // Prefer the policy's OWN currency (set by the backend's per-policy
  // conversion) over the caller-supplied display currency — using the
  // display currency unconditionally here mislabeled a raw, unconverted
  // supplier amount as if it were already in the user's selected currency.
  const fmt = (amount: number, policyCurrency?: string) => {
    const cur = policyCurrency ?? currency;
    return cur ? `${cur} ${amount}` : `${amount}`;
  };

  // Single policy with fee + deadline: "Free until {date}. After that, a fee of {amount} will apply."
  if (policies.length === 1) {
    const p = policies[0];
    const deadline = p.from ?? p.deadline;
    const hasFee = !isZero(p);

    if (hasFee && deadline) {
      const amount = Number(p.amount ?? 0);
      const pct = Number(p.percentage ?? 0);
      const feeText = amount > 0
        ? `a fee of ${fmt(amount, p.currency)} will apply`
        : pct > 0
          ? `a ${pct}% fee will apply`
          : `a fee will apply`;
      return `Free until ${formatPolicyDate(deadline)}. After that, ${feeText}.`;
    }

    if (isZero(p) && deadline) {
      return `Free until ${formatPolicyDate(deadline)}.`;
    }

    if (isZero(p)) {
      return "Free cancellation.";
    }

    if (hasFee && !deadline) {
      return `Cancellation fee: ${fmt(Number(p.amount ?? 0), p.currency) || String(p.percentage ?? 'applies')}.`;
    }
  }

  // Multiple policies: show each tier. Fee-only dated tiers are free until the
  // first deadline — say so up front.
  const dated = policies.every((p) => !isZero(p) && !!(p.from ?? p.deadline));
  const freePrefix = dated
    ? (() => {
        const first = [...policies].sort(
          (a, b) => new Date(a.from ?? a.deadline ?? 0).getTime() - new Date(b.from ?? b.deadline ?? 0).getTime(),
        )[0];
        return isDeadlineFuture(first)
          ? `Free until ${formatPolicyDate(first.from ?? first.deadline)} · `
          : "";
      })()
    : "";
  return freePrefix + policies
    .map((p, i) => {
      const deadline = p.from ?? p.deadline;
      if (isZero(p)) {
        return deadline ? `Free until ${formatPolicyDate(deadline)}` : "Free cancellation";
      }
      const amount = Number(p.amount ?? 0);
      const pct = Number(p.percentage ?? 0);
      return deadline ? `After ${formatPolicyDate(deadline)}: ${fmt(amount || pct, p.currency)} fee` : `${fmt(amount || pct, p.currency)} fee`;
    })
    .join(" · ");
}

export function getCancellationPolicyView(rate: CancellationPolicyInput, currency?: string): CancellationPolicyView {
  const policies = rate?.cancellationPolicies ?? [];
  const text = rate?.cancellationPolicyText?.trim() ?? "";
  const hasDates = policies.some((p) => p.from);

  if (policies.length > 0) {
    // Check if ALL policies are zero (fully free)
    if (policies.every(isZero)) {
      const desc = hasDates ? describePolicies(policies, currency) : text || describePolicies(policies, currency);
      return { isFree: true, isNonRefundable: false, label: "Free cancellation", description: desc || "Free cancellation" };
    }

    // Check if ALL policies are 100% (non-refundable)
    if (policies.every(isFull)) {
      const desc = hasDates ? describePolicies(policies, currency) : text || describePolicies(policies, currency);
      return { isFree: false, isNonRefundable: true, label: "Non-refundable", description: text || desc || "Non-refundable" };
    }

    // Multi-tier: has policies with dates — check if currently in free period
    // A rate is "free cancellation" when:
    // 1. At least one zero-fee deadline is in the future, OR
    // 2. A single policy with fee + deadline where the deadline is in the future
    //    (meaning: before the deadline, no fee applies = currently free)
    const hasFutureFreeDeadline = policies.some((p) => isZero(p) && isDeadlineFuture(p));
    // Fee-only tiers ("fee applies AFTER this date") mean free until the first
    // deadline, so the rate is free while that first deadline is still ahead.
    const feeOnlyDated = policies.every((p) => !isZero(p) && !!(p.from ?? p.deadline));
    const earliestFee = feeOnlyDated
      ? [...policies].sort(
          (a, b) => new Date(a.from ?? a.deadline ?? 0).getTime() - new Date(b.from ?? b.deadline ?? 0).getTime(),
        )[0]
      : null;
    const hasFutureFeeDeadline = !!earliestFee && isDeadlineFuture(earliestFee);

    if (hasFutureFreeDeadline || hasFutureFeeDeadline) {
      const desc = hasDates ? describePolicies(policies, currency) : text || describePolicies(policies, currency);
      return { isFree: true, isNonRefundable: false, label: "Free cancellation", description: desc || "Free cancellation" };
    }

    // All zero-fee deadlines are in the past — now in fee period
    const desc = hasDates ? describePolicies(policies, currency) : text || describePolicies(policies, currency);
    return {
      isFree: false,
      isNonRefundable: false,
      label: "Cancellation fee applies",
      description: desc || text || "Fee applies",
    };
  }

  if (rate?.refundable === true) {
    return { isFree: true, isNonRefundable: false, label: "Free cancellation", description: text || "Free cancellation" };
  }
  if (rate?.refundable === false) {
    return { isFree: false, isNonRefundable: true, label: "Non-refundable", description: text || "Non-refundable" };
  }

  if (/free/i.test(text)) {
    return { isFree: true, isNonRefundable: false, label: "Free cancellation", description: text || null };
  }
  if (/non-?refundable/i.test(text)) {
    return { isFree: false, isNonRefundable: true, label: "Non-refundable", description: text || null };
  }
  if (text) {
    return { isFree: false, isNonRefundable: false, label: "Cancellation fee applies", description: text };
  }
  return {
    isFree: false,
    isNonRefundable: false,
    label: "Cancellation policy",
    description: "The supplier confirms the cancellation terms when you book.",
  };
}

/** True when the rate is free-cancellation (for the search/filter). */
export function isFreeCancellation(rate: CancellationPolicyInput): boolean {
  return getCancellationPolicyView(rate).isFree;
}
