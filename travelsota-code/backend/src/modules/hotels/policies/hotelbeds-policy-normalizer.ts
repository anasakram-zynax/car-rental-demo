import type {
  PolicyNormalizer,
  SupplierPolicy,
  PolicyTier,
} from './policy-normalizer.interface';

/**
 * Normalizes Hotelbeds cancellation policies into SupplierPolicy.
 *
 * Hotelbeds raw shape (verified from API responses):
 * {
 *   cancellationPolicies: [
 *     { amount: "181.58", from: "2026-08-20T18:00:00+05:00" }
 *   ],
 *   rateComments: "...",
 *   paymentType: "AT_WEB"
 * }
 *
 * Multi-tier: array has 2+ entries. Each entry means:
 * "After `from` date, the cancellation fee is `amount`."
 * The applicable policy is the most recent one whose deadline has passed.
 */
export class HotelbedsPolicyNormalizer implements PolicyNormalizer {
  readonly supplier = 'hotelbeds';

  normalize(rawRate: any): SupplierPolicy | null {
    if (!rawRate) return null;

    const rawPolicies = rawRate?.cancellationPolicies;
    const hasPolicies =
      Array.isArray(rawPolicies) && rawPolicies.length > 0;

    if (!hasPolicies && !rawRate?.rateComments) return null;

    const policies: PolicyTier[] = hasPolicies
      ? rawPolicies.map((p: any) => ({
          amount: p.amount,
          from: p.from,
          deadline: p.deadline,
          policyType: p.policyType,
          percentage: p.percentage,
          numberOfNights: p.numberOfNights,
        }))
      : [];

    const refundable = this.isRefundable(policies);

    return {
      refundable,
      cancellationPolicies: policies,
      cancellationPolicyText: this.buildText(policies, refundable),
      rateComments: rawRate?.rateComments ?? undefined,
      modificationAllowed: rawRate?.paymentType !== 'NRF',
    };
  }

  /**
   * A rate is refundable when ALL policies have zero fees.
   * No policies = NOT refundable (conservative default).
   */
  private isRefundable(policies: PolicyTier[]): boolean {
    if (!policies.length) return false;
    return policies.every((p) => {
      const amount = Number(p.amount ?? 0);
      const percentage = Number(p.percentage ?? 0);
      const nights = Number(p.numberOfNights ?? 0);
      return amount === 0 && percentage === 0 && nights === 0;
    });
  }

  /**
   * Build human-readable text from policies.
   * Format: "Free cancellation until {date}. After that, a fee of {amount} applies."
   */
  private buildText(
    policies: PolicyTier[],
    refundable: boolean,
  ): string | undefined {
    if (!policies.length) return undefined;

    if (refundable) {
      // All zero fees — find the earliest deadline to show "free until when"
      const deadlines = policies
        .map((p) => p.from ?? p.deadline)
        .filter(Boolean)
        .sort();
      if (deadlines.length > 0) {
        return `Free cancellation until ${this.formatDate(deadlines[0])}.`;
      }
      return 'Free cancellation.';
    }

    // Non-refundable or fee applies — find the most recent deadline
    const sorted = [...policies]
      .filter((p) => p.from ?? p.deadline)
      .sort(
        (a, b) =>
          new Date(b.from ?? b.deadline ?? 0).getTime() -
          new Date(a.from ?? a.deadline ?? 0).getTime(),
      );

    if (sorted.length > 0) {
      const deadline = sorted[0].from ?? sorted[0].deadline;
      const amount = Number(sorted[0].amount ?? 0);
      if (amount === 0) {
        return `Free cancellation until ${this.formatDate(deadline)}.`;
      }
      return `Free cancellation until ${this.formatDate(deadline)}. After that, a fee of ${amount} will apply.`;
    }

    // No deadlines — just say non-refundable
    return 'Non-refundable rate.';
  }

  private formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', {
        month: 'long',
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
