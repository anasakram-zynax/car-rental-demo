import { Inject, Injectable } from '@nestjs/common';

import { PaymentGateway } from '../../domain/enums/payment-gateway.enum';
import { PaymentGatewayInterface } from '../../domain/interfaces/payment-gateway.interface';
import { PAYMENT_GATEWAY_REGISTRY } from '../../domain/constants/payment-gateway-registry.constant';

@Injectable()
export class PaymentOrchestratorService {
  constructor(
    @Inject(PAYMENT_GATEWAY_REGISTRY)
    private readonly registry:
      Map<
        PaymentGateway,
        PaymentGatewayInterface
      >,
  ) {}

  getGateway(
    gateway: PaymentGateway,
  ): PaymentGatewayInterface {

    const provider =
      this.registry.get(gateway);

    if (!provider) {
      throw new Error(
        `Unsupported gateway: ${gateway}`,
      );
    }

    return provider;
  }
}