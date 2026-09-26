import { HotelbedsPolicyNormalizer } from './hotelbeds-policy-normalizer';

describe('HotelbedsPolicyNormalizer', () => {
  const normalizer = new HotelbedsPolicyNormalizer();

  it('returns null for null/undefined input', () => {
    expect(normalizer.normalize(null)).toBeNull();
    expect(normalizer.normalize(undefined)).toBeNull();
    expect(normalizer.normalize({})).toBeNull();
  });

  it('extracts single cancellation policy', () => {
    const raw = {
      cancellationPolicies: [
        { amount: '181.58', from: '2026-08-20T18:00:00+05:00' },
      ],
      rateComments: 'Non-refundable rate',
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(false);
    expect(result!.cancellationPolicies).toHaveLength(1);
    expect(result!.cancellationPolicies[0].amount).toBe('181.58');
    expect(result!.cancellationPolicies[0].from).toBe('2026-08-20T18:00:00+05:00');
    expect(result!.rateComments).toBe('Non-refundable rate');
  });

  it('extracts multi-tier cancellation policies', () => {
    const raw = {
      cancellationPolicies: [
        { amount: '141.00', from: '2026-09-14T23:59:00+02:00' },
        { amount: '70.50', from: '2026-09-12T23:59:00+02:00' },
      ],
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.cancellationPolicies).toHaveLength(2);
    expect(result!.refundable).toBe(false);
  });

  it('marks as refundable when all fees are zero', () => {
    const raw = {
      cancellationPolicies: [
        { amount: '0', from: '2026-08-20T18:00:00+05:00' },
      ],
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(true);
  });

  it('marks as not refundable when no policies exist', () => {
    const raw = { rateComments: 'Some comment' };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(false);
  });

  it('returns null when no policies and no rateComments', () => {
    const raw = { paymentType: 'AT_WEB' };
    expect(normalizer.normalize(raw)).toBeNull();
  });

  it('passes through extra fields from Hotelbeds', () => {
    const raw = {
      cancellationPolicies: [
        { amount: '50', from: '2026-08-20T18:00:00', policyType: 'CANCELLATION' },
      ],
      rateComments: 'Special rate',
      paymentType: 'AT_WEB',
    };
    const result = normalizer.normalize(raw);
    expect(result).not.toBeNull();
    expect(result!.cancellationPolicies[0].policyType).toBe('CANCELLATION');
    expect(result!.rateComments).toBe('Special rate');
    expect(result!.modificationAllowed).toBe(true);
  });
});
