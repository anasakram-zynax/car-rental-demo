import { Injectable } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';

import { PaymentRepository } from '../../domain/repositories/payment.repository';

import { PaymentStatus } from '../../domain/enums/payment-status.enum';

import { PaymentOrchestratorService } from '../services/payment-orchestrator.service';

@Injectable()
export class CancelPaymentUseCase {
    constructor(
        private readonly paymentRepository: PaymentRepository,
        private readonly orchestrator: PaymentOrchestratorService,
    ) { }

    async execute(
        paymentId: string,
    ) {
        const payment =
            await this.paymentRepository.findById(
                paymentId,
            );

        if (!payment) {
            throw new BusinessError('PAYMENT_NOT_FOUND');
        }

        if (
            payment.status !==
            PaymentStatus.PENDING
        ) {
            throw new BusinessError('PAYMENT_CANCELLATION_FAILED', 'Only pending payments can be cancelled');
        }

        if (
            payment.providerPaymentId
        ) {
            const gateway =
                this.orchestrator.getGateway(
                    payment.gateway,
                );

            if (
                gateway.cancelPayment
            ) {
                await gateway.cancelPayment(
                    payment.providerPaymentId,
                );
            }
        }

        payment.status =
            PaymentStatus.CANCELLED;

        payment.updatedAt =
            new Date();

        await this.paymentRepository.update(
            payment,
        );

        return {
            paymentId: payment.id,
            status: payment.status,
        };
    }
}