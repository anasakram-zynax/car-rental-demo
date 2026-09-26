import { Injectable } from '@nestjs/common';
import type {
  SupplierPolicy,
  AggregatedPolicy,
  PolicyTier,
} from './policy-normalizer.interface';

/**
 * Aggregates supplier-level policies into a single AggregatedPolicy
 * that the frontend consumes uniformly.
 *
 * Takes a SupplierPolicy (from any supplier normalizer) and produces
 * the canonical AggregatedPolicy shape.
 */
@Injectable()
export class PolicyAggregatorService {
  /**
   * Aggregate a supplier policy into the unified AggregatedPolicy shape.
   * @param supplier - Supplier key (e.g. "hotelbeds", "ratehawk")
   * @param supplierPolicy - Normalized policy from the supplier normalizer
   * @returns AggregatedPolicy for frontend consumption, or null if no data
   */
  aggregate(
    supplier: string,
    supplierPolicy: SupplierPolicy | null,
  ): AggregatedPolicy | null {
    if (!supplierPolicy) return null;

    const { refundable, cancellationPolicies, cancellationPolicyText, rateComments, modificationAllowed } =
      supplierPolicy;

    // Find the free cancellation deadline (earliest zero-fee deadline)
    const freeCancellationUntil = this.findFreeCancellationDeadline(
      cancellationPolicies,
      refundable,
    );

    // Find the applicable fee (most recent passed deadline)
    const feeInfo = this.findApplicableFee(cancellationPolicies);

    // Build display text
    const displayText = this.buildDisplayText(
      refundable,
      freeCancellationUntil,
      feeInfo,
      cancellationPolicyText,
    );

    return {
      refundable,
      freeCancellationUntil,
      cancellationFee: feeInfo?.amount ?? null,
      feeType: feeInfo?.type ?? null,
      modificationAllowed: modificationAllowed ?? true,
      displayText,
      rateComments: rateComments ?? '',
      rawPolicies: cancellationPolicies,
      supplier,
    };
  }

  /**
   * Find the free cancellation deadline.
   * For refundable rates: the latest deadline where fee is zero.
   * For non-refundable rates: null.
   */
  private findFreeCancellationDeadline(
    policies: PolicyTier[],
    refundable: boolean,
  ): string | null {
    if (!refundable || !policies.length) return null;

    // Find policies with zero fees — their `from` date is the free cancellation deadline
    const zeroFeePolicies = policies.filter((p) => {
      const amount = Number(p.amount ?? 0);
      const percentage = Number(p.percentage ?? 0);
      const nights = Number(p.numberOfNights ?? 0);
      return amount === 0 && percentage === 0 && nights === 0;
    });

    // Supplier tiers are "fee applies AFTER this date". When a refundable rate
    // has only dated fee tiers (Travelport Stays), it is free until the first
    // deadline.
    const source = zeroFeePolicies.length
      ? zeroFeePolicies
      : policies.every((p) => !!(p.from ?? p.deadline))
        ? policies
        : [];
    if (!source.length) return null;

    // The free cancellation deadline is the earliest `from` date among the
    // chosen tiers (before that date, cancellation is free)
    const deadlines = source
      .map((p) => p.from ?? p.deadline)
      .filter((d): d is string => !!d)
      .sort();

    return deadlines.length > 0 ? deadlines[0] : null;
  }

  /**
   * Find the applicable cancellation fee based on current time.
   * Picks the most recent passed deadline and returns its fee.
   */
  private findApplicableFee(
    policies: PolicyTier[],
  ): { amount: number; type: 'flat' | 'percentage' | 'nights' } | null {
    if (!policies.length) return null;

    const now = Date.now();

    // Filter to policies whose deadline has passed (fee is now applicable)
    const applicable = policies
      .filter((p) => {
        const deadline = p.from ?? p.deadline;
        if (!deadline) return true; // no deadline = always applies
        const d = new Date(deadline);
        return Number.isFinite(d.getTime()) && d.getTime() <= now;
      })
      .sort((a, b) => {
        const da = new Date(a.from ?? a.deadline ?? 0).getTime();
        const db = new Date(b.from ?? b.deadline ?? 0).getTime();
        return db - da; // most recent first
      });

    if (!applicable.length) return null;

    const policy = applicable[0];

    if (policy.amount !== undefined && policy.amount !== null) {
      const amount = Number(policy.amount);
      if (Number.isFinite(amount) && amount > 0) {
        return { amount, type: 'flat' };
      }
    }

    if (policy.percentage !== undefined && policy.percentage !== null) {
      const pct = Number(policy.percentage);
      if (Number.isFinite(pct) && pct > 0) {
        return { amount: pct, type: 'percentage' };
      }
    }

    if (policy.numberOfNights !== undefined && policy.numberOfNights !== null) {
      const nights = Number(policy.numberOfNights);
      if (Number.isFinite(nights) && nights > 0) {
        return { amount: nights, type: 'nights' };
      }
    }

    return null;
  }

  /**
   * Build human-readable display text for the frontend.
   */
  private buildDisplayText(
    refundable: boolean,
    freeCancellationUntil: string | null,
    feeInfo: { amount: number; type: 'flat' | 'percentage' | 'nights' } | null,
    supplierText: string | undefined,
  ): string {
    if (refundable && freeCancellationUntil) {
      // The supplier text already spells out the fee that follows the free
      // window (Travelport Stays) — keep it instead of dropping that detail.
      if (supplierText && /after that|then/i.test(supplierText)) {
        return supplierText;
      }
      return `Free cancellation until ${this.formatDate(freeCancellationUntil)}.`;
    }

    if (refundable) {
      return 'Free cancellation.';
    }

    if (supplierText && /non-?refundable/i.test(supplierText)) {
      return supplierText;
    }

    if (feeInfo) {
      if (feeInfo.type === 'flat') {
        return `Cancellation fee: ${feeInfo.amount}.`;
      }
      if (feeInfo.type === 'percentage') {
        return `Cancellation fee: ${feeInfo.amount}% of total.`;
      }
      if (feeInfo.type === 'nights') {
        return `Cancellation fee: ${feeInfo.amount} night(s).`;
      }
    }

    if (supplierText) {
      return supplierText;
    }

    return 'Non-refundable rate.';
  }

  private formatDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return dateStr;
    }
  }
}
