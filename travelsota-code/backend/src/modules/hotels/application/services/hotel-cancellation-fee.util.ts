export interface HotelCancellationPolicyInput {
  amount?: string;
  from?: string;
  deadline?: string;
  percentage?: string;
  numberOfNights?: number;
  policyType?: string;
}

export interface CancellationFeeResult {
  cancellationFee: number;
  refundAmount: number;
  isFreeCancellation: boolean;
  policyDescription: string | null;
  matchedPolicy: HotelCancellationPolicyInput | null;
  /** Fee that will apply after the next (future) policy deadline. */
  upcomingFee?: number;
  /** Deadline of the next (future) policy that starts charging. */
  upcomingFeeFrom?: string;
  /** Human-readable "free until X, then Y applies" description. */
  upcomingFeeDescription?: string | null;
}

/**
 * Compute the cancellation penalty for a hotel booking from its supplier
 * cancellation policies (Hotelbeds shape: amount/percentage + from/deadline).
 *
 * Semantics: each policy entry applies when the cancellation happens AFTER
 * its `from`/`deadline` date. The applicable policy is the most recent one
 * whose deadline has passed. No passed deadline → free cancellation.
 *
 * `paidAmount` and the returned amounts are in the payment/charge currency.
 * `exchangeRate` (supplier→charge) converts fixed `policy.amount` values,
 * which are denominated in the supplier currency, into the charge currency.
 */
export function computeHotelCancellationFee(
  policies: HotelCancellationPolicyInput[] | null | undefined,
  paidAmount: number,
  now: Date = new Date(),
  exchangeRate: number = 1,
): CancellationFeeResult {
  const total = Number.isFinite(paidAmount) ? paidAmount : 0;

  if (!Array.isArray(policies) || policies.length === 0) {
    return {
      cancellationFee: 0,
      refundAmount: total,
      isFreeCancellation: true,
      policyDescription: null,
      matchedPolicy: null,
    };
  }

  const applicable = policies
    .filter((p) => {
      const deadline = p.deadline ?? p.from;
      if (!deadline) return true;
      const d = new Date(deadline);
      return Number.isFinite(d.getTime()) && d.getTime() <= now.getTime();
    })
    .sort((a, b) => {
      const da = new Date((a.deadline ?? a.from) ?? 0).getTime();
      const db = new Date((b.deadline ?? b.from) ?? 0).getTime();
      return db - da;
    });

  if (applicable.length === 0) {
    const upcoming = findUpcomingPolicy(policies, now, exchangeRate, total);
    return {
      cancellationFee: 0,
      refundAmount: total,
      isFreeCancellation: true,
      policyDescription: null,
      matchedPolicy: null,
      upcomingFee: upcoming?.fee,
      upcomingFeeFrom: upcoming?.from,
      upcomingFeeDescription: upcoming?.description,
    };
  }

  const policy = applicable[0];
  let fee = 0;

  if (policy.amount) {
    const supplierFee = Number(policy.amount) || 0;
    fee = Math.round(supplierFee * exchangeRate * 100) / 100;
  } else if (policy.percentage) {
    const pct = Number(policy.percentage) || 0;
    fee = (total * pct) / 100;
  }

  fee = Math.min(Math.round(fee * 100) / 100, total);
  const refundAmount = Math.max(0, Math.round((total - fee) * 100) / 100);

  return {
    cancellationFee: fee,
    refundAmount,
    isFreeCancellation: fee === 0,
    policyDescription: describePolicy(policy, fee, total),
    matchedPolicy: policy,
  };
}

/**
 * Find the earliest FUTURE policy that will start charging a fee. Returns the
 * fee (converted to charge currency), its deadline, and a readable description
 * so the UI can show "Free now — X applies after <date>".
 */
function findUpcomingPolicy(
  policies: HotelCancellationPolicyInput[],
  now: Date,
  exchangeRate: number,
  total: number,
): { fee: number; from: string; description: string | null } | undefined {
  const future = policies
    .filter((p) => {
      const deadline = p.deadline ?? p.from;
      if (!deadline) return false;
      const d = new Date(deadline);
      return Number.isFinite(d.getTime()) && d.getTime() > now.getTime();
    })
    .filter((p) => {
      const amount = Number(p.amount ?? 0);
      const percentage = Number(p.percentage ?? 0);
      const nights = Number(p.numberOfNights ?? 0);
      return amount > 0 || percentage > 0 || nights > 0;
    })
    .sort((a, b) => {
      const da = new Date((a.deadline ?? a.from) ?? 0).getTime();
      const db = new Date((b.deadline ?? b.from) ?? 0).getTime();
      return da - db;
    });

  const next = future[0];
  if (!next) return undefined;

  const deadline = next.deadline ?? next.from;
  let fee = 0;
  if (next.amount) {
    fee = Math.round(Number(next.amount) * exchangeRate * 100) / 100;
  } else if (next.percentage) {
    fee = Math.round((total * Number(next.percentage)) / 100 * 100) / 100;
  } else if (next.numberOfNights) {
    fee = Math.round(total * Number(next.numberOfNights) * 100) / 100;
  }

  const when = deadline ? formatPolicyDateOnly(deadline) : '';
  return {
    fee,
    from: deadline ?? '',
    description: when
      ? `Free cancellation until ${when} — then ${fee} applies.`
      : `Then ${fee} applies.`,
  };
}

function describePolicy(
  policy: HotelCancellationPolicyInput,
  fee: number,
  total: number,
): string | null {
  const type = policy.policyType
    ? policy.policyType.toLowerCase().replace(/_/g, ' ')
    : 'cancellation';
  const deadline = policy.deadline ?? policy.from;
  const when = deadline
    ? ` if cancelled on or after ${formatPolicyDateOnly(deadline)}`
    : '';
  if (fee <= 0) return null;
  if (policy.percentage) {
    return `${policy.percentage}% ${type} fee${when}`;
  }
  if (policy.numberOfNights) {
    return `${policy.numberOfNights}-night ${type} charge${when}`;
  }
  return `${fee} ${type} fee${when}`;
}

/**
 * Render a supplier policy timestamp using its raw date part (M/D/YYYY) —
 * NO timezone conversion. Hotelbeds sends deadlines with offsets (e.g.
 * 2026-08-14T23:59:00+04:00); converting to a server/browser timezone
 * shifts the displayed day and makes the same policy look different in
 * different places. The date portion is what the supplier and the booking
 * screen show.
 */
function formatPolicyDateOnly(value: string): string {
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return value;
  const [y, m, d] = datePart.split('-').map(Number);
  return `${m}/${d}/${y}`;
}
