import {
  canTransition,
  assertTransition,
  isBookingFailure,
  isBookingPending,
  isBookingSuccess,
  isBookingTerminal,
  classifySupplierStatus,
  BookingStatus,
} from './booking-state-machine';

describe('BookingStateMachine', () => {
  describe('canTransition', () => {
    describe('void_requested', () => {
      it('allows ticketed → void_requested', () => {
        expect(canTransition('ticketed', 'void_requested')).toBe(true);
      });

      it('allows booked → void_requested', () => {
        expect(canTransition('booked', 'void_requested')).toBe(true);
      });

      it('allows void_requested → voided', () => {
        expect(canTransition('void_requested', 'voided')).toBe(true);
      });

      it('allows void_requested → failed', () => {
        expect(canTransition('void_requested', 'failed')).toBe(true);
      });

      it('does not allow void_requested → ticketed', () => {
        expect(canTransition('void_requested', 'ticketed')).toBe(false);
      });
    });

    describe('voided', () => {
      it('allows voided → refund_pending', () => {
        expect(canTransition('voided', 'refund_pending')).toBe(true);
      });

      it('does not allow voided → ticketed', () => {
        expect(canTransition('voided', 'ticketed')).toBe(false);
      });

      it('does not allow voided → cancelled', () => {
        expect(canTransition('voided', 'cancelled')).toBe(false);
      });
    });

    describe('refund_requested', () => {
      it('allows ticketed → refund_requested', () => {
        expect(canTransition('ticketed', 'refund_requested')).toBe(true);
      });

      it('allows refund_requested → refund_pending', () => {
        expect(canTransition('refund_requested', 'refund_pending')).toBe(true);
      });

      it('allows refund_requested → failed', () => {
        expect(canTransition('refund_requested', 'failed')).toBe(true);
      });

      it('does not allow refund_requested → ticketed', () => {
        expect(canTransition('refund_requested', 'ticketed')).toBe(false);
      });
    });

    describe('ticketing_failed_refund_needed', () => {
      it('allows ticketing_failed_refund_needed → refund_pending', () => {
        expect(canTransition('ticketing_failed_refund_needed', 'refund_pending')).toBe(true);
      });

      it('allows ticketing_failed_refund_needed → cancelled', () => {
        expect(canTransition('ticketing_failed_refund_needed', 'cancelled')).toBe(true);
      });

      it('does not allow ticketing_failed_refund_needed → ticketed', () => {
        expect(canTransition('ticketing_failed_refund_needed', 'ticketed')).toBe(false);
      });
    });

    describe('payment_failed and payment_expired', () => {
      it('allows payment_failed → cancelled', () => {
        expect(canTransition('payment_failed', 'cancelled')).toBe(true);
      });

      it('allows payment_failed → refund_pending', () => {
        expect(canTransition('payment_failed', 'refund_pending')).toBe(true);
      });

      it('allows payment_expired → cancelled', () => {
        expect(canTransition('payment_expired', 'cancelled')).toBe(true);
      });

      it('does not allow payment_failed → ticketed', () => {
        expect(canTransition('payment_failed', 'ticketed')).toBe(false);
      });
    });

    describe('terminal states', () => {
      it('ticketed is terminal', () => {
        expect(isBookingTerminal('ticketed')).toBe(true);
      });

      it('refunded is terminal', () => {
        expect(isBookingTerminal('refunded')).toBe(true);
      });

      it('voided is not terminal', () => {
        expect(isBookingTerminal('voided')).toBe(false);
      });
    });

    describe('invalid source status', () => {
      it('returns false for unknown status', () => {
        expect(canTransition('nonexistent_status', 'ticketed')).toBe(false);
      });
    });
  });

  describe('assertTransition', () => {
    it('returns true for valid transition', () => {
      expect(assertTransition('ticketed', 'void_requested')).toBe(true);
    });

    it('returns false for invalid transition', () => {
      expect(assertTransition('ticketed', 'pending_payment')).toBe(false);
    });

    it('returns false for unknown source', () => {
      expect(assertTransition('bogus_status', 'ticketed')).toBe(false);
    });
  });

  describe('isBookingSuccess', () => {
    it('returns true for booked', () => expect(isBookingSuccess('booked')).toBe(true));
    it('returns true for held', () => expect(isBookingSuccess('held')).toBe(true));
    it('returns true for ticketed', () => expect(isBookingSuccess('ticketed')).toBe(true));
    it('returns false for voided', () => expect(isBookingSuccess('voided')).toBe(false));
    it('returns false for cancelled', () => expect(isBookingSuccess('cancelled')).toBe(false));
  });

  describe('isBookingFailure', () => {
    it('returns true for failed', () => expect(isBookingFailure('failed')).toBe(true));
    it('returns true for failed_supplier_booking', () => expect(isBookingFailure('failed_supplier_booking')).toBe(true));
    it('returns true for payment_failed', () => expect(isBookingFailure('payment_failed')).toBe(true));
    it('returns true for payment_expired', () => expect(isBookingFailure('payment_expired')).toBe(true));
    it('returns false for cancelled', () => expect(isBookingFailure('cancelled')).toBe(false));
  });

  describe('isBookingPending', () => {
    it('returns true for pending_payment', () => expect(isBookingPending('pending_payment')).toBe(true));
    it('returns true for held_pending_payment', () => expect(isBookingPending('held_pending_payment')).toBe(true));
    it('returns true for booking_in_progress', () => expect(isBookingPending('booking_in_progress')).toBe(true));
    it('returns false for ticketed', () => expect(isBookingPending('ticketed')).toBe(false));
  });

  describe('classifySupplierStatus', () => {
    it('classifies confirmed as success', () => {
      expect(classifySupplierStatus('confirmed')).toBe('success');
    });
    it('classifies ok as success', () => {
      expect(classifySupplierStatus('ok')).toBe('success');
    });
    it('classifies failed as failure', () => {
      expect(classifySupplierStatus('failed')).toBe('failure');
    });
    it('classifies cancelled as failure', () => {
      expect(classifySupplierStatus('cancelled')).toBe('failure');
    });
    it('classifies processing as pending', () => {
      expect(classifySupplierStatus('processing')).toBe('pending');
    });
    it('classifies null as unknown', () => {
      expect(classifySupplierStatus(null)).toBe('unknown');
    });
    it('classifies undefined as unknown', () => {
      expect(classifySupplierStatus(undefined)).toBe('unknown');
    });
    it('classifies empty string as unknown', () => {
      expect(classifySupplierStatus('')).toBe('unknown');
    });
    it('is case-insensitive', () => {
      expect(classifySupplierStatus('CONFIRMED')).toBe('success');
    });
  });
});
