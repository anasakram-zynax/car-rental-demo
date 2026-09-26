export interface PaymentResult {
  status: 'PAID' | 'FAILED' | 'PENDING' | 'AUTHORIZED';

  providerStatus: string;

  raw: any;
}