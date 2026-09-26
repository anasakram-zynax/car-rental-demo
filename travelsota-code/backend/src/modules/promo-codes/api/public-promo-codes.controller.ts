import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../../../shared/auth/optional-jwt-auth.guard';
import { PromoCodeEligibilityService } from '../application/services/promo-code-eligibility.service';
import { PromoCodePricingService } from '../application/services/promo-code-pricing.service';
import { PromoCodeRepositoryToken } from '../application/ports/promo-code.repository.port';
import type { IPromoCodeRepository } from '../application/ports/promo-code.repository.port';
import { QuotePromoCodeDto } from './dto';
import { BusinessError } from '../../../shared/errors/business-error';
import { CurrencyService } from '../../currency/application/services/currency.service';
import { PaymentRepository } from '../../payment/domain/repositories/payment.repository';
import { FlightBookingRepoPortToken } from '../../flights/application/ports/flight-booking-repo.port';
import { HotelBookingRepoPortToken } from '../../hotels/application/ports/hotel-booking-repo.port';
import type { FlightBookingRepoPort } from '../../flights/application/ports/flight-booking-repo.port';
import type { HotelBookingRepoPort } from '../../hotels/application/ports/hotel-booking-repo.port';
import { Logger } from '@nestjs/common';

@Controller('promo-codes')
export class PublicPromoCodesController {
  private readonly logger = new Logger(PublicPromoCodesController.name);

  constructor(
    private readonly eligibilityService: PromoCodeEligibilityService,
    private readonly pricingService: PromoCodePricingService,
    @Inject(PromoCodeRepositoryToken) private readonly promoCodeRepo: IPromoCodeRepository,
    private readonly paymentRepo: PaymentRepository,
    @Inject(FlightBookingRepoPortToken) private readonly flightBookingRepo: FlightBookingRepoPort,
    @Inject(HotelBookingRepoPortToken) private readonly hotelBookingRepo: HotelBookingRepoPort,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * Derive booking context from a payment ID.  The payment links to a
   * booking via `payment.bookingId` + `payment.bookingType`.
   */
  private async deriveContextFromPaymentId(paymentId: string) {
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment) {
      throw new BusinessError('BOOKING_NOT_FOUND');
    }

    const { bookingId, bookingType } = payment;

    if (bookingType === 'FLIGHT') {
      const booking = await this.flightBookingRepo.findById(bookingId);
      if (!booking) {
        throw new BusinessError('BOOKING_NOT_FOUND');
      }
      const amountMinor = await this.currencyService.toSmallestUnit(booking.amount ?? 0, booking.currency ?? 'USD');
      const offerSnapshot = booking.offerSnapshot as any;
      const from = offerSnapshot?.origin;
      const to = offerSnapshot?.destination;
      return {
        bookingId: booking.id,
        currency: booking.currency ?? 'USD',
        amountMinor,
        productType: 'flights',
        routeCode: from && to ? `${from}-${to}` : undefined,
        airlineCode: offerSnapshot?.operatingCarrier,
        cabinClass: offerSnapshot?.cabin,
        hotelId: undefined,
        destinationCode: undefined,
        providerKey: booking.provider,
        userId: booking.userId,
      };
    }

    if (bookingType === 'HOTEL') {
      const booking = await this.hotelBookingRepo.findById(bookingId);
      if (!booking) {
        throw new BusinessError('BOOKING_NOT_FOUND');
      }
      const customerAmount = booking.customerAmount ?? booking.amount ?? 0;
      const customerCurrency = booking.customerCurrency ?? booking.currency ?? 'USD';
      const amountMinor = await this.currencyService.toSmallestUnit(customerAmount, customerCurrency);
      return {
        bookingId: booking.id,
        currency: customerCurrency,
        amountMinor,
        productType: 'hotels',
        routeCode: undefined,
        airlineCode: undefined,
        cabinClass: undefined,
        hotelId: booking.hotelId ?? booking.providerHotelId ?? undefined,
        destinationCode: undefined,
        providerKey: booking.provider,
        userId: booking.userId ?? undefined,
      };
    }

    throw new BusinessError('BOOKING_NOT_FOUND');
  }

  /**
   * Derive booking context from a booking ID directly.
   */
  private async deriveContextFromBookingId(bookingId: string, productType: string) {
    if (productType === 'flights' || productType === 'flight') {
      const booking = await this.flightBookingRepo.findById(bookingId);
      if (!booking) {
        throw new BusinessError('BOOKING_NOT_FOUND');
      }
      const amountMinor = await this.currencyService.toSmallestUnit(booking.amount ?? 0, booking.currency ?? 'USD');
      const offerSnapshot = booking.offerSnapshot as any;
      const from = offerSnapshot?.origin;
      const to = offerSnapshot?.destination;
      return {
        bookingId: booking.id,
        currency: booking.currency ?? 'USD',
        amountMinor,
        productType: 'flights',
        routeCode: from && to ? `${from}-${to}` : undefined,
        airlineCode: offerSnapshot?.operatingCarrier,
        cabinClass: offerSnapshot?.cabin,
        hotelId: undefined,
        destinationCode: undefined,
        providerKey: booking.provider,
        userId: booking.userId,
      };
    }

    if (productType === 'hotels' || productType === 'hotel') {
      const booking = await this.hotelBookingRepo.findById(bookingId);
      if (!booking) {
        throw new BusinessError('BOOKING_NOT_FOUND');
      }
      const customerAmount = booking.customerAmount ?? booking.amount ?? 0;
      const customerCurrency = booking.customerCurrency ?? booking.currency ?? 'USD';
      const amountMinor = await this.currencyService.toSmallestUnit(customerAmount, customerCurrency);
      return {
        bookingId: booking.id,
        currency: customerCurrency,
        amountMinor,
        productType: 'hotels',
        routeCode: undefined,
        airlineCode: undefined,
        cabinClass: undefined,
        hotelId: booking.hotelId ?? booking.providerHotelId ?? undefined,
        destinationCode: undefined,
        providerKey: booking.provider,
        userId: booking.userId ?? undefined,
      };
    }

    throw new BusinessError('BOOKING_NOT_FOUND');
  }

  /**
   * Quote a promo code for a booking.
   *
   * When `paymentId` or `bookingId` is provided the endpoint derives all
   * pricing, currency, product type, route/hotel context and user from the
   * server-side database record so the client cannot manipulate eligibility
   * or discount.
   *
   * Fallback: if neither is supplied the legacy DTO fields are used (server-
   * to-server calls only).
   */
  @Post('quote')
  @UseGuards(OptionalJwtAuthGuard)
  @ResponseMessage('Promo quote calculated.')
  async quote(@Body() dto: QuotePromoCodeDto, @CurrentUser() user?: any) {
    const promo = await this.promoCodeRepo.findByCode(dto.code);
    if (!promo) {
      throw new BusinessError('PROMO_CODE_NOT_FOUND_OR_USED');
    }

    if (!promo.isPublic) {
      throw new BusinessError('PROMO_CODE_NOT_FOUND_OR_USED');
    }

    let serverCtx: {
      bookingId: string; currency: string; amountMinor: number;
      productType: string; routeCode?: string; airlineCode?: string;
      cabinClass?: string; hotelId?: string; destinationCode?: string;
      providerKey?: string; userId?: string;
    } | undefined;

    if (dto.paymentId) {
      serverCtx = await this.deriveContextFromPaymentId(dto.paymentId);
    } else if (dto.bookingId && dto.productType) {
      serverCtx = await this.deriveContextFromBookingId(dto.bookingId, dto.productType);
    }

    const currency = serverCtx?.currency ?? 'USD';
    const subtotal = serverCtx?.amountMinor ?? 0;

    const eligibility = await this.eligibilityService.check({
      promoCode: promo,
      userId: user?.id ?? serverCtx?.userId,
      productType: serverCtx?.productType ?? dto.productType ?? 'flights',
      currency,
      bookingSubtotalMinor: subtotal,
      routeCode: serverCtx?.routeCode ?? dto.routeCode,
      airlineCode: serverCtx?.airlineCode ?? dto.airlineCode,
      cabinClass: serverCtx?.cabinClass ?? dto.cabinClass,
      hotelId: serverCtx?.hotelId ?? dto.hotelId,
      destinationCode: serverCtx?.destinationCode ?? dto.destinationCode,
      providerKey: serverCtx?.providerKey ?? dto.providerKey,
    });

    if (!eligibility.eligible) {
      throw new BusinessError(eligibility.reason as any ?? 'PROMO_CODE_INVALID');
    }

    const discount = this.pricingService.calculate({
      promoCode: promo,
      bookingSubtotalMinor: subtotal,
      currency,
    });

    return {
      code: promo.code,
      name: promo.name,
      discountType: promo.discountType,
      discountMinor: discount.discountMinor,
      finalAmountMinor: discount.finalAmountMinor,
      currency: discount.currency,
      minBookingAmountMinor: promo.minBookingAmountMinor,
    };
  }
}
