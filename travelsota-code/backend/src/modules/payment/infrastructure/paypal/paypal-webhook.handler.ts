import { Injectable } from '@nestjs/common';

import { PaypalGateway } from './paypal-gateway';
import { HandlePaypalWebhookUseCase } from '../../application/use-cases/handle-paypal-webhook.use-case';

@Injectable()
export class PaypalWebhookHandler {
  constructor(
    private readonly paypalGateway: PaypalGateway,
    private readonly webhookUseCase: HandlePaypalWebhookUseCase,
  ) {}

  async handle(
    payload: any,
    headers: Record<string, string>,
  ): Promise<void> {
    const event =
      await this.paypalGateway.constructWebhookEvent(
        payload,
        headers,
      );

    await this.webhookUseCase.execute(
      event,
    );
  }
}