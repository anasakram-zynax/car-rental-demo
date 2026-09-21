import { calculateRentalDays, dateRangesOverlap } from './date-range.js';

describe('DateRange', () => {
  describe('dateRangesOverlap', () => {
    it('should detect overlapping dates', () => {
      const existing = {
        start: new Date('2026-10-10T10:00:00Z'),
        end: new Date('2026-10-15T10:00:00Z'),
      };

      const requested = {
        start: new Date('2026-10-12T10:00:00Z'),
        end: new Date('2026-10-17T10:00:00Z'),
      };

      expect(dateRangesOverlap(existing, requested)).toBe(true);
    });

    it('should allow back-to-back ranges', () => {
      const existing = {
        start: new Date('2026-10-10T10:00:00Z'),
        end: new Date('2026-10-15T10:00:00Z'),
      };

      const requested = {
        start: new Date('2026-10-15T10:00:00Z'),
        end: new Date('2026-10-20T10:00:00Z'),
      };

      expect(dateRangesOverlap(existing, requested)).toBe(false);
    });
  });

  describe('calculateRentalDays', () => {
    it('should calculate exact rental days', () => {
      const pickup = new Date('2026-10-10T10:00:00Z');

      const returnAt = new Date('2026-10-13T10:00:00Z');

      expect(calculateRentalDays(pickup, returnAt)).toBe(3);
    });

    it('should round a partial day up', () => {
      const pickup = new Date('2026-10-10T10:00:00Z');

      const returnAt = new Date('2026-10-11T14:00:00Z');

      expect(calculateRentalDays(pickup, returnAt)).toBe(2);
    });
  });
});
