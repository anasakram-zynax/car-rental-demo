import { Injectable } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import { randomUUID, createHash } from 'crypto';

import { PaymentEntity } from '../../domain/entities/payment.entity';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';

import { PaymentRepository } from '../../domain/repositories/payment.repository';

import { PaymentOrchestratorService } from '../services/payment-orchestrator.service';

import { CreatePaymentIntentDto } from '../../api/dto/create-payment-intent.dto';
import { PaymentGatewayConfigService } from '../../../settings/application/services/payment-gateway-config.service';
import { isGatewayCurrencySupported } from '../../domain/constants/gateway-currency-support.constant';

@Injectable()
export class CreatePaymentIntentUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly orchestrator: PaymentOrchestratorService,
    private readonly gatewayConfigService: PaymentGatewayConfigService,
  ) { }

  async execute(dto: CreatePaymentIntentDto) {
    const gateways = await this.gatewayConfigService.getGatewaysSummary();
    const gw = gateways.find(g => g.gateway === dto.gateway.toLowerCase());
    if (!gw || !gw.enabled) {
      throw new BusinessError('PAYMENT_GATEWAY_DISABLED', `Payment gateway "${dto.gateway}" is not enabled`);
    }

    if (!isGatewayCurrencySupported(dto.gateway, dto.currency)) {
      throw new BusinessError(
        'GATEWAY_CURRENCY_UNSUPPORTED',
        `${dto.gateway} does not support ${dto.currency.toUpperCase()}. Choose a different payment method or currency.`,
      );
    }

    // Deterministic idempotency key: same booking+gateway always produces same key
    const idempotencyKey = createHash('sha256')
      .update(`payment:${dto.bookingId}:${dto.gateway}`)
      .digest('hex')
      .slice(0, 32);

    // Idempotency: Check by idempotency key first (catches retries after Stripe succeeded but DB write failed)
    const existingByKey = await this.paymentRepository.findByIdempotencyKey(idempotencyKey);
    if (existingByKey) {
      if (existingByKey.status === PaymentStatus.PAID) {
        throw new BusinessError('PAYMENT_CONFLICT', `Booking ${dto.bookingId} already has a completed payment.`);
      }
      return {
        paymentId: existingByKey.id,
        reference: existingByKey.reference,
        clientSecret: existingByKey.providerClientSecret,
        checkoutUrl: existingByKey.providerCheckoutUrl,
      };
    }

    // Check for existing payment for this booking (idempotency)
    const existingPayments = await this.paymentRepository.findMany({ bookingId: dto.bookingId });
    const activePayment = existingPayments.find(
      (p) => p.status === PaymentStatus.PENDING || p.status === PaymentStatus.PAID,
    );
    if (activePayment) {
      if (activePayment.status === PaymentStatus.PAID) {
        throw new BusinessError('PAYMENT_CONFLICT', `Booking ${dto.bookingId} already has a completed payment.`);
      }
      // Return existing pending payment so frontend can retry
      return {
        paymentId: activePayment.id,
        reference: activePayment.reference,
        clientSecret: activePayment.providerClientSecret,
        checkoutUrl: activePayment.providerCheckoutUrl,
      };
    }

    const payment = new PaymentEntity({
      id: randomUUID(),

      idempotencyKey,

      reference: `PAY-${randomUUID().slice(0, 8).toUpperCase()}`,

      bookingId: dto.bookingId,
      bookingType: dto.bookingType,
      gateway: dto.gateway,
      amount: dto.amount,
      currency: dto.currency,
      status: PaymentStatus.PENDING,
      captureMethod: dto.captureMethod,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      customerId: dto.customerId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PaymentEntity);

    const gateway = this.orchestrator.getGateway(dto.gateway);

    const result = await gateway.createPayment(payment);

    payment.providerPaymentId = result.providerPaymentId;
    payment.providerClientSecret = result.clientSecret;
    payment.providerCheckoutUrl = result.checkoutUrl;

    await this.paymentRepository.create(payment);

    return {
      paymentId: payment.id,
      reference: payment.reference,
      clientSecret: result.clientSecret,
      checkoutUrl: result.checkoutUrl,
    };
  }
}