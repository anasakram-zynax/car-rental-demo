import { computeHotelCancellationFee } from './hotel-cancellation-fee.util';

const NOW = new Date('2026-08-12T12:00:00Z');

describe('computeHotelCancellationFee', () => {
  it('returns free cancellation when no policies exist', () => {
    const result = computeHotelCancellationFee(undefined, 350);
    expect(result.cancellationFee).toBe(0);
    expect(result.refundAmount).toBe(350);
    expect(result.isFreeCancellation).toBe(true);
  });

  it('returns free cancellation when policy deadline is in the future', () => {
    const result = computeHotelCancellationFee(
      [{ amount: '50', from: '2026-09-01T00:00:00' }],
      350,
      NOW,
    );
    expect(result.cancellationFee).toBe(0);
    expect(result.refundAmount).toBe(350);
    expect(result.isFreeCancellation).toBe(true);
  });

  it('applies fixed amount when deadline has passed', () => {
    const result = computeHotelCancellationFee(
      [
        { amount: '25', from: '2026-08-10T00:00:00' },
        { amount: '50', from: '2026-08-01T00:00:00' },
      ],
      350,
      NOW,
    );
    // Most recent passed deadline (Aug 10) wins
    expect(result.cancellationFee).toBe(25);
    expect(result.refundAmount).toBe(325);
    expect(result.isFreeCancellation).toBe(false);
  });

  it('applies percentage when no fixed amount', () => {
    const result = computeHotelCancellationFee(
      [{ percentage: '100', from: '2026-08-01T00:00:00' }],
      350,
      NOW,
    );
    expect(result.cancellationFee).toBe(350);
    expect(result.refundAmount).toBe(0);
  });

  it('caps fee at total amount', () => {
    const result = computeHotelCancellationFee(
      [{ amount: '9999', from: '2026-08-01T00:00:00' }],
      100,
      NOW,
    );
    expect(result.cancellationFee).toBe(100);
    expect(result.refundAmount).toBe(0);
  });

  it('returns zero refund when not paid', () => {
    const result = computeHotelCancellationFee(
      [{ amount: '50', from: '2026-08-01T00:00:00' }],
      0,
      NOW,
    );
    expect(result.cancellationFee).toBe(0);
    expect(result.refundAmount).toBe(0);
  });

  it('builds policy description with percentage', () => {
    const result = computeHotelCancellationFee(
      [{ percentage: '50', from: '2026-08-01T00:00:00' }],
      200,
      NOW,
    );
    expect(result.policyDescription).toContain('50%');
  });
});
