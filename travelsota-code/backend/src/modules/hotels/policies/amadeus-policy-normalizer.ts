import type {
  PolicyNormalizer,
  SupplierPolicy,
  PolicyTier,
} from './policy-normalizer.interface';

/**
 * Normalizes Amadeus cancellation policies into SupplierPolicy.
 *
 * Amadeus raw shape (verified from API docs + normalizer code):
 * {
 *   policies: {
 *     cancellations: [
 *       { amount: "150.00", deadline: "2026-09-01T18:00:00", policyType: "CANCELLATION" }
 *     ],
 *     refundable: { cancellationRefund: "REFUNDABLE" | "REFUNDABLE_UP_TO_DEADLINE" | "NON_REFUNDABLE" }
 *   }
 * }
 *
 * The `deadline` field is the free cancellation cutoff — same semantics as Hotelbeds `from`.
 * Before deadline = free. After deadline = fee applies.
 */
export class AmadeusPolicyNormalizer implements PolicyNormalizer {
  readonly supplier = 'amadeus';

  normalize(rawRate: any): SupplierPolicy | null {
    if (!rawRate) return null;

    const cancellations = rawRate?.policies?.cancellations;
    const refundableEnum = rawRate?.policies?.refundable?.cancellationRefund;

    const hasPolicies =
      Array.isArray(cancellations) && cancellations.length > 0;

    if (!hasPolicies && !refundableEnum) return null;

    // Determine refundable from Amadeus enum
    const refundable =
      refundableEnum === 'REFUNDABLE' ||
      refundableEnum === 'REFUNDABLE_UP_TO_DEADLINE';

    const policies: PolicyTier[] = hasPolicies
      ? cancellations.map((c: any) => ({
          amount: c.amount,
          from: c.deadline,    // Amadeus uses `deadline` = free cancellation cutoff
          deadline: c.deadline,
          policyType: c.policyType,
          percentage: c.percentage,
          numberOfNights: c.numberOfNights,
        }))
      : [];

    // If refundable but no structured policies, create a default zero-fee policy
    if (refundable && policies.length === 0) {
      policies.push({ amount: '0' });
    }

    return {
      refundable,
      cancellationPolicies: policies,
      cancellationPolicyText: this.buildText(policies, refundable),
      rateComments: rawRate?.policies?.paymentType ?? undefined,
      modificationAllowed: rawRate?.policies?.paymentType !== 'NONE_ACCEPTED',
    };
  }

  private buildText(
    policies: PolicyTier[],
    refundable: boolean,
  ): string | undefined {
    if (!policies.length) return undefined;

    if (refundable && policies.every((p) => Number(p.amount ?? 0) === 0)) {
      return 'Free cancellation.';
    }

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
