import { Injectable } from '@nestjs/common';

import { PaymentRepository } from '../../domain/repositories/payment.repository';

@Injectable()
export class ListPaymentsUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
  ) {}

  async execute(filters: {
    bookingId?: string;
    status?: string;
    gateway?: string;
    from?: Date;
    to?: Date;
  }) {
    return this.paymentRepository.findMany(
      filters,
    );
  }
}