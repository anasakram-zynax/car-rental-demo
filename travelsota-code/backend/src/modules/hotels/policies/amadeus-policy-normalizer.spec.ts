import { AmadeusPolicyNormalizer } from './amadeus-policy-normalizer';

describe('AmadeusPolicyNormalizer', () => {
  const normalizer = new AmadeusPolicyNormalizer();

  it('returns null for null/undefined input', () => {
    expect(normalizer.normalize(null)).toBeNull();
    expect(normalizer.normalize(undefined)).toBeNull();
    expect(normalizer.normalize({})).toBeNull();
  });

  it('extracts refundable rate with no structured policies', () => {
    const raw = {
      policies: {
        refundable: { cancellationRefund: 'REFUNDABLE' },
      },
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(true);
    expect(result!.cancellationPolicies).toHaveLength(1);
    expect(result!.cancellationPolicies[0].amount).toBe('0');
  });

  it('extracts non-refundable rate', () => {
    const raw = {
      policies: {
        refundable: { cancellationRefund: 'NON_REFUNDABLE' },
        cancellations: [
          { amount: '181.58', deadline: '2026-08-20T18:00:00Z', policyType: 'CANCELLATION' },
        ],
      },
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(false);
    expect(result!.cancellationPolicies).toHaveLength(1);
    expect(result!.cancellationPolicies[0].amount).toBe('181.58');
    expect(result!.cancellationPolicies[0].from).toBe('2026-08-20T18:00:00Z');
  });

  it('extracts refundable up to deadline', () => {
    const raw = {
      policies: {
        refundable: { cancellationRefund: 'REFUNDABLE_UP_TO_DEADLINE' },
        cancellations: [
          { amount: '50.00', deadline: '2026-09-01T12:00:00Z' },
        ],
      },
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(true);
    expect(result!.cancellationPolicies[0].from).toBe('2026-09-01T12:00:00Z');
  });

  it('extracts multi-tier cancellation policies', () => {
    const raw = {
      policies: {
        refundable: { cancellationRefund: 'NON_REFUNDABLE' },
        cancellations: [
          { amount: '100.00', deadline: '2026-09-14T23:59:00Z', policyType: 'CANCELLATION' },
          { amount: '50.00', deadline: '2026-09-12T23:59:00Z', policyType: 'CANCELLATION' },
        ],
      },
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.cancellationPolicies).toHaveLength(2);
    expect(result!.refundable).toBe(false);
  });

  it('returns null when no policies and no refundable enum', () => {
    const raw = { policies: {} };
    expect(normalizer.normalize(raw)).toBeNull();
  });

  it('handles missing policies gracefully', () => {
    const raw = {
      policies: {
        refundable: { cancellationRefund: 'REFUNDABLE' },
      },
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(true);
    expect(result!.cancellationPolicies).toHaveLength(1);
    expect(result!.cancellationPolicies[0].amount).toBe('0');
  });
});
