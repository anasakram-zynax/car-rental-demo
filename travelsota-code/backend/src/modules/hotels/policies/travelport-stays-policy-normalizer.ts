import type {
  PolicyNormalizer,
  SupplierPolicy,
  PolicyTier,
} from './policy-normalizer.interface';

/**
 * Normalizes a validated Travelport Stays rate into SupplierPolicy.
 *
 * The rate carries the tiers parsed from the live Rules call
 * (travelport-stays-rules.parser.ts): each tier means "cancelling AFTER
 * `from` costs `amount` / `percentage` of the stay". Before the first
 * deadline cancellation is free.
 *
 * Returns null when the supplier gave no terms — the caller then shows the
 * policy as unknown instead of inventing "free cancellation".
 */
export class TravelportStaysPolicyNormalizer implements PolicyNormalizer {
  readonly supplier = 'travelport-stays';

  normalize(rawRate: any): SupplierPolicy | null {
    if (!rawRate) return null;
    const raw = Array.isArray(rawRate.cancellationPolicies)
      ? rawRate.cancellationPolicies
      : [];
    const policies: PolicyTier[] = raw.map((p: any) => ({
      amount: p.amount,
      from: p.from,
      deadline: p.deadline,
      policyType: p.policyType,
      percentage: p.percentage,
      numberOfNights: p.numberOfNights,
    }));

    if (policies.length === 0 && typeof rawRate.refundable !== 'boolean') {
      return null;
    }

    const refundable =
      typeof rawRate.refundable === 'boolean'
        ? rawRate.refundable
        : policies.every(
            (p) =>
              Number(p.amount ?? 0) === 0 &&
              Number(p.percentage ?? 0) === 0 &&
              Number(p.numberOfNights ?? 0) === 0,
          );

    return {
      refundable,
      cancellationPolicies: policies,
      cancellationPolicyText: rawRate.cancellationPolicyText ?? undefined,
      rateComments: rawRate.rateComments ?? undefined,
      modificationAllowed: true,
    };
  }
}
