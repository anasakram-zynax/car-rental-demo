import { PaymentEntity } from "../entities/payment.entity";
import { PaymentResult } from "./payment-result.interface";

export interface CreatePaymentResult {
    providerPaymentId: string;

    clientSecret?: string;

    checkoutUrl?: string;

    providerPayerId?: string;


}
export interface PaymentGatewayInterface {
    createPayment(
        payment: PaymentEntity,
    ): Promise<CreatePaymentResult>;

    getPayment(
        providerPaymentId: string,
    ): Promise<PaymentResult>;

    capturePayment?(
        providerPaymentId: string,
    ): Promise<any>;


    confirmPayment(
  providerPaymentId: string,
): Promise<PaymentResult>;


    cancelPayment?(
        providerPaymentId: string,
    ): Promise<void>;

    /** Refund an already-captured payment. `amount` is in major units. */
    refundPayment?(
        providerPaymentId: string,
        amount?: number,
        currency?: string,
    ): Promise<void>;

    constructWebhookEvent(
        payload: any,
        signatureOrHeaders: any,
    ): Promise<any>;


}