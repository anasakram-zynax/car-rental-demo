export enum PaymentGateway {
  STRIPE = "STRIPE",
  PAYPAL = "PAYPAL",
  BANK_TRANSFER = "BANK_TRANSFER",
  PAY_LATER = "PAY_LATER",
}

/** Manual (non-gateway) methods: hold now, verify/collect later. No adapter call. */
export function isManualPaymentGateway(gateway: string): boolean {
  const g = gateway.toUpperCase();
  return (
    g === PaymentGateway.BANK_TRANSFER || g === PaymentGateway.PAY_LATER
  );
}