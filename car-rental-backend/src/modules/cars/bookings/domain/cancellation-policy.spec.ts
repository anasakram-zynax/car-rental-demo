import { assertCancellationAllowed } from './cancellation-policy.js';

describe('CancellationPolicy', () => {
  it('should allow cancellation more than 24 hours before pickup', () => {
    const now = new Date('2026-10-10T10:00:00Z');

    const pickup = new Date('2026-10-12T10:00:00Z');

    expect(() => assertCancellationAllowed(pickup, now)).not.toThrow();
  });

  it('should allow cancellation exactly 24 hours before pickup', () => {
    const now = new Date('2026-10-10T10:00:00Z');

    const pickup = new Date('2026-10-11T10:00:00Z');

    expect(() => assertCancellationAllowed(pickup, now)).not.toThrow();
  });

  it('should reject cancellation less than 24 hours before pickup', () => {
    const now = new Date('2026-10-10T10:00:00Z');

    const pickup = new Date('2026-10-11T09:59:00Z');

    expect(() => assertCancellationAllowed(pickup, now)).toThrow();
  });
});
