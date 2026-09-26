import { Injectable, NotFoundException } from '@nestjs/common';

import { PaymentRepository } from '../../domain/repositories/payment.repository';

@Injectable()
export class GetPaymentUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
  ) {}

  async execute(paymentId: string) {
    
    const payment =
      await this.paymentRepository.findById(
        paymentId,
      );

    if (!payment) {
      throw new NotFoundException(
        'Payment not found',
      );
    }

    return payment;
  }
}