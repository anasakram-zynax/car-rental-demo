import { Injectable, Logger } from '@nestjs/common';
import { StripeGateway } from './stripe.gateway';
import { HandleWebhookUseCase } from '../../application/use-cases/handle-webhook.use-case';

@Injectable()
export class StripeWebhookHandler {
  private readonly logger = new Logger(StripeWebhookHandler.name);

  constructor(
    private readonly stripeGateway: StripeGateway,
    private readonly webhookUseCase: HandleWebhookUseCase,
  ) {}

  async handle(payload: Buffer, signature: string): Promise<void> {
    const event = await this.stripeGateway.constructWebhookEvent(payload, signature);
    this.logger.log(`Stripe webhook received: ${event.type}`);
    await this.webhookUseCase.execute(event);
  }
}
