import { apiRequest } from '@/lib/api/client';
import { ROUTES } from '@/lib/routes';

export interface ConfirmPaymentResponse {
  paymentId: string;
  reference: string;
  status: string;
  providerStatus: string;
}

export function confirmPayment(paymentId: string) {
  return apiRequest<ConfirmPaymentResponse>(ROUTES.PAYMENTS.CONFIRM, {
    method: 'POST',
    body: { paymentId },
    auth: true,
  });
}
