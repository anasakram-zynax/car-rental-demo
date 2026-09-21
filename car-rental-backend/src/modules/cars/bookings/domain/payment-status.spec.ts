import {
  assertPaymentTransitionAllowed,
  PaymentStatus,
} from './payment-status.js';

describe('PaymentStatus', () => {
  it('should allow unpaid to paid', () => {
    expect(() =>
      assertPaymentTransitionAllowed(PaymentStatus.UNPAID, PaymentStatus.PAID),
    ).not.toThrow();
  });

  it('should allow paid to refunded', () => {
    expect(() =>
      assertPaymentTransitionAllowed(
        PaymentStatus.PAID,
        PaymentStatus.REFUNDED,
      ),
    ).not.toThrow();
  });

  it('should reject unpaid to refunded', () => {
    expect(() =>
      assertPaymentTransitionAllowed(
        PaymentStatus.UNPAID,
        PaymentStatus.REFUNDED,
      ),
    ).toThrow();
  });

  it('should reject refunded to paid', () => {
    expect(() =>
      assertPaymentTransitionAllowed(
        PaymentStatus.REFUNDED,
        PaymentStatus.PAID,
      ),
    ).toThrow();
  });
});
