import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import { CreatePaymentIntentUseCase } from '../../../payment/application/use-cases/create-payment-intent.use-case';
import { BookingType } from '../../../payment/domain/enums/booking-type.enum';
import { PaymentGateway } from '../../../payment/domain/enums/payment-gateway.enum';
import type { CarRentalCheckoutDto } from '../../api/dto/car-checkout.dto';
import { CarsService } from './cars.service';
import { Inject } from '@nestjs/common';
import {
  CarBookingRepositoryPortToken,
  type CarBookingRepositoryPort,
} from '../ports/car-booking-repository.port';

@Injectable()
export class CarCheckoutService {
  constructor(
    private readonly carsService: CarsService,
    private readonly createPaymentIntent: CreatePaymentIntentUseCase,
    @Inject(CarBookingRepositoryPortToken)
    private readonly bookingRepository: CarBookingRepositoryPort,
  ) {}

  async checkout(input: CarRentalCheckoutDto, userId?: string) {
    if (
      input.gateway !== PaymentGateway.STRIPE &&
      input.gateway !== PaymentGateway.PAYPAL
    ) {
      throw new BusinessError(
        'CARS_PAYMENT_METHOD_UNSUPPORTED',
        'Cars checkout currently supports Stripe or PayPal.',
      );
    }

    const publicRef = this.publicRef(userId, input);
    const returnLocation =
      input.dropoffLocation?.trim() ||
      input.returnAt?.trim() ||
      input.pickupLocation.trim();
    const customerSnapshot = {
      contactName: input.contactName.trim(),
      contactEmail: input.contactEmail.trim().toLowerCase(),
      contactPhone: input.contactPhone.trim(),
      pickupLocation: input.pickupLocation.trim(),
      dropoffLocation: returnLocation,
      returnAt: input.returnAt?.trim() || null,
      pickupAt: input.pickupAt,
      dropoffAt: input.dropoffAt ?? null,
      quantity: input.quantity,
    };
    const booking =
      input.serviceType === 'transfer'
        ? await this.carsService.reserveTransferForCheckout({
            publicRef,
            transferPackageId: input.transferPackageId!,
            userId,
            pickupAt: input.pickupAt,
            quantity: input.quantity,
            customerSnapshot,
          })
        : await this.carsService.reserveRentalForCheckout({
            publicRef,
            fleetId: input.fleetId!,
            userId,
            pickupLocation: input.pickupLocation.trim(),
            dropoffLocation: returnLocation,
            pickupAt: input.pickupAt,
            dropoffAt: input.dropoffAt!,
            quantity: input.quantity,
            customerSnapshot,
          });

    if ((userId && booking.userId !== userId) || (!userId && booking.userId)) {
      throw new BusinessError(
        'CAR_RENTAL_DUPLICATE_ALLOCATION',
        'This checkout reference is already in use.',
        HttpStatus.CONFLICT,
      );
    }
    if (!['pending_payment', 'booked'].includes(booking.status)) {
      throw new BusinessError(
        'CAR_RENTAL_CHECKOUT_CLOSED',
        'This checkout can no longer accept payment.',
        HttpStatus.CONFLICT,
      );
    }

    try {
      const payment = await this.createPaymentIntent.execute({
        bookingId: booking.id,
        bookingType: BookingType.CAR,
        gateway: input.gateway,
        amount: booking.total,
        currency: booking.currency,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        customerId: input.customerId,
      });
      return {
        bookingId: booking.id,
        bookingRef: booking.publicRef,
        status: booking.status,
        paymentId: payment.paymentId,
        paymentReference: payment.reference,
        amount: booking.total,
        currency: booking.currency,
        clientSecret: payment.clientSecret ?? null,
        checkoutUrl: payment.checkoutUrl ?? null,
      };
    } catch (error) {
      await this.bookingRepository.atomicClaimStatus(
        booking.id,
        'pending_payment',
        'failed_payment',
      );
      throw error;
    }
  }

  private publicRef(userId: string | undefined, input: CarRentalCheckoutDto) {
    const scope = userId
      ? userId
      : [
          'guest',
          input.serviceType,
          input.fleetId ?? input.transferPackageId ?? '',
          input.pickupLocation.trim(),
          input.dropoffLocation?.trim() ?? input.returnAt?.trim() ?? '',
          input.pickupAt,
          input.dropoffAt ?? '',
          input.quantity,
        ].join(':');
    const digest = createHash('sha256')
      .update(`car-checkout:${scope}:${input.idempotencyKey.trim()}`)
      .digest('hex')
      .slice(0, 20)
      .toUpperCase();
    return `CAR-${digest}`;
  }
}
