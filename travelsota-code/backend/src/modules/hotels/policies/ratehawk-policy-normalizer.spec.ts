import { RateHawkPolicyNormalizer } from './ratehawk-policy-normalizer';

describe('RateHawkPolicyNormalizer', () => {
  const normalizer = new RateHawkPolicyNormalizer();

  it('returns null for null/undefined input', () => {
    expect(normalizer.normalize(null)).toBeNull();
    expect(normalizer.normalize(undefined)).toBeNull();
    expect(normalizer.normalize({})).toBeNull();
  });

  it('extracts structured cancellation penalties with free_cancellation_before', () => {
    const raw = {
      refundable: true,
      payment_options: {
        payment_types: [{
          cancellation_penalties: {
            free_cancellation_before: '2026-09-01T12:00:00',
            policies: [
              { start_at: null, end_at: '2026-09-01T12:00:00', amount_charge: '150.00', amount_show: '150.00' },
            ],
          },
        }],
      },
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(true);
    expect(result!.cancellationPolicies.length).toBeGreaterThanOrEqual(1);
    // Should have at least the free deadline policy
    const freePolicy = result!.cancellationPolicies.find((p) => Number(p.amount) === 0);
    expect(freePolicy).toBeDefined();
    expect(freePolicy!.from).toBe('2026-09-01T12:00:00');
  });

  it('extracts structured penalties without free_cancellation_before', () => {
    const raw = {
      refundable: false,
      payment_options: {
        payment_types: [{
          cancellation_penalties: {
            policies: [
              { start_at: null, end_at: '2026-09-01T12:00:00', amount_charge: '100.00' },
            ],
          },
        }],
      },
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(false);
    expect(result!.cancellationPolicies.length).toBeGreaterThanOrEqual(1);
    const feePolicy = result!.cancellationPolicies.find((p) => Number(p.amount) > 0);
    expect(feePolicy).toBeDefined();
    expect(feePolicy!.amount).toBe('100.00');
    expect(feePolicy!.from).toBe('2026-09-01T12:00:00');
  });

  it('synthesizes 100% penalty for non-refundable without structured data', () => {
    const raw = {
      refundable: false,
      cancel_policy: 'Non-refundable rate',
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(false);
    expect(result!.cancellationPolicies).toHaveLength(1);
    expect(result!.cancellationPolicies[0].percentage).toBe('100');
  });

  it('synthesizes zero fee for refundable without structured data', () => {
    const raw = {
      refundable: true,
      cancel_policy: 'Free cancellation',
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(true);
    expect(result!.cancellationPolicies).toHaveLength(1);
    expect(result!.cancellationPolicies[0].amount).toBe('0');
  });

  it('handles missing payment_options gracefully', () => {
    const raw = {
      refundable: true,
      cancel_policy: 'Free cancellation',
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(true);
  });
});
