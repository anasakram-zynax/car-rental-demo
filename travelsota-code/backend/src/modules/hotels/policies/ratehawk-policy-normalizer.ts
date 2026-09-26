import type {
  PolicyNormalizer,
  SupplierPolicy,
  PolicyTier,
} from './policy-normalizer.interface';

/**
 * Normalizes RateHawk cancellation policies into SupplierPolicy.
 *
 * RateHawk raw shape (from public ETG V3 API docs + codebase analysis):
 * {
 *   refundable: true/false,
 *   cancel_policy: "Free cancellation before..." (free text),
 *   payment_options: {
 *     payment_types: [{
 *       cancellation_penalties: {
 *         free_cancellation_before: "2026-09-01T12:00:00",
 *         policies: [
 *           { start_at: null, end_at: "2026-09-01T12:00:00", amount_charge: "150.00", amount_show: "150.00" }
 *         ]
 *       }
 *     }]
 *   }
 * }
 *
 * The `free_cancellation_before` is the free cancellation deadline.
 * `policies[]` contains the penalty tiers with start/end dates and amounts.
 */
export class RateHawkPolicyNormalizer implements PolicyNormalizer {
  readonly supplier = 'ratehawk';

  normalize(rawRate: any): SupplierPolicy | null {
    if (!rawRate) return null;

    // The controller passes ALREADY-NORMALIZED rates (internal shape with
    // cancellationPolicies[]), not raw ETG responses. Handle BOTH shapes.

    // Shape 1: already-normalized — has cancellationPolicies array directly
    if (Array.isArray(rawRate.cancellationPolicies) && rawRate.cancellationPolicies.length > 0) {
      const policies = rawRate.cancellationPolicies;
      const refundable = this.isRefundable(policies);
      return {
        refundable: rawRate.refundable ?? refundable,
        cancellationPolicies: policies,
        cancellationPolicyText: rawRate.cancellationPolicyText ?? undefined,
        rateComments: undefined,
        modificationAllowed: (rawRate.refundable ?? refundable) !== false,
      };
    }

    // Shape 2: raw RateHawk rate
    const refundable = rawRate.refundable;
    const cancelPolicyText = rawRate.cancel_policy ?? rawRate.cancellationPolicyText;
    const cancellationPenalties = rawRate?.payment_options?.payment_types?.[0]?.cancellation_penalties;

    const hasStructuredData = cancellationPenalties && (
      cancellationPenalties.free_cancellation_before ||
      (Array.isArray(cancellationPenalties.policies) && cancellationPenalties.policies.length > 0)
    );

    if (!hasStructuredData && refundable === undefined && !cancelPolicyText) {
      return null;
    }

    let policies: PolicyTier[] = [];

    if (hasStructuredData) {
      policies = this.extractPolicies(cancellationPenalties);
    } else if (refundable === false) {
      policies = [{ policyType: 'CANCELLATION', percentage: '100' }];
    } else if (refundable === true) {
      policies = [{ amount: '0' }];
    }

    return {
      refundable: refundable ?? false,
      cancellationPolicies: policies,
      cancellationPolicyText: cancelPolicyText ?? undefined,
      rateComments: undefined,
      modificationAllowed: refundable !== false,
    };
  }

  /** A policy set is "refundable" when every tier is zero-fee. */
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
   * Extract structured policies from RateHawk cancellation_penalties.
   *
   * RateHawk provides:
   * - `free_cancellation_before`: ISO datetime deadline for free cancellation
   * - `policies[]`: array of penalty tiers with start_at/end_at dates and amounts
   *
   * We map this to our standard PolicyTier format:
   * - `from` = the deadline (free_cancellation_before or end_at)
   * - `amount` = the penalty amount
   */
  private extractPolicies(cancellationPenalties: any): PolicyTier[] {
    const policies: PolicyTier[] = [];

    // First, use free_cancellation_before as the free deadline
    if (cancellationPenalties.free_cancellation_before) {
      // Add a zero-fee policy for the free period
      policies.push({
        amount: '0',
        from: cancellationPenalties.free_cancellation_before,
      });
    }

    // Then, add penalty tiers from policies[]
    if (Array.isArray(cancellationPenalties.policies)) {
      for (const penalty of cancellationPenalties.policies) {
        const amount = penalty.amount_charge ?? penalty.amount_show ?? '0';
        const deadline = penalty.end_at ?? penalty.start_at;

        // Skip zero-fee policies (already covered by free_cancellation_before)
        if (Number(amount) === 0 && policies.some((p) => Number(p.amount) === 0)) {
          continue;
        }

        policies.push({
          amount: String(amount),
          from: deadline ?? undefined,
        });
      }
    }

    return policies;
  }
}
