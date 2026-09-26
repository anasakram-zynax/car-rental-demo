import { PolicyAggregatorService } from './policy-aggregator.service';
import type { SupplierPolicy } from './policy-normalizer.interface';

const NOW = new Date('2026-08-12T12:00:00Z');

describe('PolicyAggregatorService', () => {
  const service = new PolicyAggregatorService();

  it('returns null for null input', () => {
    expect(service.aggregate('hotelbeds', null)).toBeNull();
  });

  it('aggregates refundable rate with free cancellation deadline', () => {
    const policy: SupplierPolicy = {
      refundable: true,
      cancellationPolicies: [
        { amount: '0', from: '2026-08-20T18:00:00+05:00' },
      ],
      modificationAllowed: true,
    };
    const result = service.aggregate('hotelbeds', policy);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(true);
    expect(result!.freeCancellationUntil).toBe('2026-08-20T18:00:00+05:00');
    expect(result!.cancellationFee).toBeNull();
    expect(result!.feeType).toBeNull();
    expect(result!.displayText).toContain('Free cancellation until');
    expect(result!.supplier).toBe('hotelbeds');
  });

  it('aggregates non-refundable rate with fee', () => {
    const policy: SupplierPolicy = {
      refundable: false,
      cancellationPolicies: [
        { amount: '181.58', from: '2026-08-20T18:00:00+05:00' },
      ],
    };
    const result = service.aggregate('hotelbeds', policy);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(false);
    expect(result!.freeCancellationUntil).toBeNull();
    expect(result!.displayText).toContain('181.58');
  });

  it('aggregates multi-tier policies', () => {
    const policy: SupplierPolicy = {
      refundable: false,
      cancellationPolicies: [
        { amount: '141.00', from: '2026-09-14T23:59:00+02:00' },
        { amount: '70.50', from: '2026-09-12T23:59:00+02:00' },
      ],
    };
    const result = service.aggregate('hotelbeds', policy);
    expect(result).not.toBeNull();
    expect(result!.rawPolicies).toHaveLength(2);
  });

  it('passes through rateComments', () => {
    const policy: SupplierPolicy = {
      refundable: true,
      cancellationPolicies: [{ amount: '0', from: '2026-08-20T18:00:00' }],
      rateComments: 'Special promotional rate',
    };
    const result = service.aggregate('hotelbeds', policy);
    expect(result!.rateComments).toBe('Special promotional rate');
  });

  it('handles empty policies gracefully', () => {
    const policy: SupplierPolicy = {
      refundable: false,
      cancellationPolicies: [],
      cancellationPolicyText: 'Non-refundable rate',
    };
    const result = service.aggregate('hotelbeds', policy);
    expect(result).not.toBeNull();
    expect(result!.refundable).toBe(false);
    expect(result!.displayText).toBe('Non-refundable rate');
  });

  it('defaults modificationAllowed to true when undefined', () => {
    const policy: SupplierPolicy = {
      refundable: true,
      cancellationPolicies: [{ amount: '0', from: '2026-08-20T18:00:00' }],
    };
    const result = service.aggregate('hotelbeds', policy);
    expect(result!.modificationAllowed).toBe(true);
  });
});
