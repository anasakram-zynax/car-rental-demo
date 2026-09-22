import { InvalidBookingTransitionError } from './booking-errors.js';

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  REFUNDED = 'refunded',
}

export function assertPaymentTransitionAllowed(
  currentStatus: PaymentStatus,
  newStatus: PaymentStatus,
): void {
  if (currentStatus === newStatus) {
    return;
  }

  const allowedTransitions: Record<PaymentStatus, PaymentStatus[]> = {
    [PaymentStatus.UNPAID]: [PaymentStatus.PAID],

    [PaymentStatus.PAID]: [PaymentStatus.REFUNDED],

    [PaymentStatus.REFUNDED]: [],
  };

  if (!allowedTransitions[currentStatus].includes(newStatus)) {
    throw new InvalidBookingTransitionError(
      `Payment status cannot change from "${currentStatus}" to "${newStatus}".`,
    );
  }
}
