import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { tmpdir } from 'os';
import { uploadFileToCloudinary } from '../../upload/cloudinary-upload.util';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { RateLimitGuard } from '../../../shared/rate-limit/rate-limit.guard';
import { FlightBookingPublicService } from '../application/services/flight-booking-public.service';
import { FlightOfferDetailQueryDto } from './dto/flight-offer-detail-query.dto';
import { FlightOfferDetailInputDto } from './dto/flight-offer-detail-input.dto';
import { FlightOfferDetailViewMapper } from '../application/services/flight-offer-detail-view.mapper';
import { BookingPreviewDto } from './dto/booking-preview.dto';
import { BookingConfirmDto } from './dto/booking-confirm.dto';
import { FlightCheckoutDto } from './dto/flight-checkout.dto';
import { FlightRepriceDto } from './dto/flight-reprice.dto';
import { FlightCheckoutSessionDto } from './dto/flight-checkout-session.dto';
import { FlightBookingDetailsDto } from './dto/flight-booking-details.dto';
import { FlightCheckoutSessionService } from '../application/services/flight-checkout-session.service';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { CurrentUser } from '../../../modules/auth/decorators/current-user.decorator';
import { FlightResponseMapper } from '../application/services/flight-response.mapper';
import { RateLimitTier } from '../../../shared/rate-limit/rate-limit-tier.decorator';
import { TravelportPostBookingExtrasService } from '../application/services/travelport-post-booking-extras.service';
import {
  ExtrasCatalogParamsDto,
  ExtrasQuoteBodyDto,
  ExtrasPaymentBodyDto,
  ExtrasConfirmBodyDto,
  ExtrasStatusParamsDto,
} from './dto/flight-booking-extras.dto';
import { BusinessError } from '../../../shared/errors/business-error';
import { AuthGuard } from '@nestjs/passport';
import { FlightOfferSnapshotService } from '../application/services/flight-offer-snapshot.service';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';
import { GuestBookingGuard } from '../../settings/api/guards/guest-booking.guard';

@Controller('flights')
@RateLimitTier({ tier: 'customer' })
export class FlightBookingsController {
  constructor(
    private readonly service: FlightBookingPublicService,
    private readonly mapper: FlightResponseMapper,
    private readonly checkoutSessionService: FlightCheckoutSessionService,
    private readonly postBookingExtrasService: TravelportPostBookingExtrasService,
    private readonly detailViewMapper: FlightOfferDetailViewMapper,
    private readonly snapshotService: FlightOfferSnapshotService,
  ) {}

  /**
   * Ownership enforcement: customers can only access their own bookings.
   * Admins and agents can access any booking.
   * Guest bookings (userId == null) are accessible by anyone with the booking UUID.
   */
  private assertOwnership(
    booking: { userId?: string | null },
    user?: { id: string; userType: string },
  ) {
    if (!user) return;
    if (user.userType === 'CUSTOMER') {
      if (booking.userId && booking.userId !== user.id) {
        throw new BusinessError(
          'AUTH_INSUFFICIENT_PERMISSIONS',
          'You do not have access to this booking.',
          403,
        );
      }
    }
  }

  @Get('offers/:offerId')
  @UserTypes('public')
  @ResponseMessage('Flight offer detail fetched.')
  getOfferDetail(
    @Param('offerId') offerId: string,
    @Query() query: FlightOfferDetailQueryDto,
  ) {
    return this.service.getOfferDetail(offerId, query.searchKey);
  }

  @Post('offers/detail')
  @UserTypes('public')
  @ResponseMessage('Flight offer detail view generated.')
  async getOfferDetailView(
    @Body() body: FlightOfferDetailInputDto,
    @CurrentUser() user?: { userType?: string },
  ) {
    const result = await this.service.getOfferDetailView(body, this.detailViewMapper);
    if (result.detailAvailable && result.detailView) {
      const isStaff = user?.userType === 'STAFF';
      if (!isStaff) {
        const { adminDebug, ...safeDetail } = result.detailView;
        result.detailView = safeDetail as typeof result.detailView;
      }
    }
    return result;
  }

  @Post('offers/:offerId/snapshot')
  @UserTypes('public')
  @UseGuards(GuestBookingGuard, RateLimitGuard)
  @ResponseMessage('Flight offer snapshot created.')
  async createSnapshot(
    @Param('offerId') offerId: string,
    @Body() body: CreateSnapshotDto,
    @CurrentUser() user?: { id?: string; userType?: string },
  ) {
    return this.snapshotService.createSnapshot({
      provider: body.provider,
      offerId,
      searchKey: body.searchKey,
      tripType: body.tripType,
      displayCurrency: body.displayCurrency,
      userId: user?.id,
      offerData: body.offerData,
    });
  }

  @Get('offers/snapshots/:snapshotId')
  @UserTypes('public')
  @ResponseMessage('Flight offer snapshot fetched.')
  async getSnapshotDetail(
    @Param('snapshotId') snapshotId: string,
    @CurrentUser() user?: { id?: string; userType?: string },
  ) {
    const detail = await this.snapshotService.getSnapshotDetail(snapshotId);
    if (user?.userType === 'CUSTOMER' && detail.userId && detail.userId !== user.id) {
      throw new BusinessError(
        'AUTH_INSUFFICIENT_PERMISSIONS',
        'You do not have access to this snapshot.',
        403,
      );
    }
    return detail;
  }

  @Post('offers/snapshots/:snapshotId/reprice')
  @UserTypes('public')
  @UseGuards(GuestBookingGuard, RateLimitGuard)
  @ResponseMessage('Snapshot offer repriced.')
  async repriceFromSnapshot(
    @Param('snapshotId') snapshotId: string,
    @Body() body: { displayCurrency?: string; totalPrice?: number; selectedAncillaries?: any[] },
    @CurrentUser() user?: any,
  ) {
    const raw = await this.snapshotService.getSnapshotRaw(snapshotId);
    if (user?.userType === 'CUSTOMER' && raw.userId && raw.userId !== user.id) {
      throw new BusinessError(
        'AUTH_INSUFFICIENT_PERMISSIONS',
        'You do not have access to this snapshot.',
        403,
      );
    }
    return this.service.repriceFromSnapshot(
      { snapshotId, displayCurrency: body.displayCurrency, totalPrice: body.totalPrice },
      user?.id,
    );
  }

  @Post('bookings/details')
  @UserTypes('customer', 'admin', 'agent')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Flight booking details fetched.')
  async getBookingDetails(@Body() body: FlightBookingDetailsDto) {
    return this.service.getBookingDetails(body);
  }

  @Post('bookings/preview')
  @UserTypes('public')
  @UseGuards(GuestBookingGuard, RateLimitGuard)
  @ResponseMessage('Booking preview validated.')
  async preview(@Body() body: BookingPreviewDto, @CurrentUser() user?: any) {
    const raw = this.service.preview(body, user?.id);
    return Promise.resolve(raw).then((x) => this.mapper.toPreviewView(x));
  }

  @Post('bookings/confirm')
  @UserTypes('public')
  @UseGuards(GuestBookingGuard, RateLimitGuard)
  @ResponseMessage('Booking confirmed.')
  async confirm(@Body() body: BookingConfirmDto) {
    const raw = this.service.confirm(body);
    return Promise.resolve(raw).then((x) => this.mapper.toConfirmView(x));
  }

  @Post('bookings/checkout-session')
  @UserTypes('customer', 'admin', 'agent')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Checkout session created.')
  async createCheckoutSession(@Body() body: FlightCheckoutSessionDto) {
    return this.checkoutSessionService.createCheckoutSession(body);
  }

  @Get('bookings/checkout-session/:sessionKey')
  @UserTypes('customer', 'admin', 'agent')
  @ResponseMessage('Checkout session retrieved.')
  async getCheckoutSession(@Param('sessionKey') sessionKey: string) {
    return this.checkoutSessionService.retrieveCheckoutSession(sessionKey);
  }

  @Post('bookings/checkout')
  @UserTypes('public')
  @UseGuards(GuestBookingGuard, RateLimitGuard)
  @ResponseMessage('Checkout initiated — proceed to payment.')
  async checkout(@Body() body: FlightCheckoutDto, @CurrentUser() user?: any) {
    return this.service.checkout(body, user?.id);
  }

  @Post('bookings/reprice')
  @UserTypes('customer', 'admin', 'agent')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Offer repriced.')
  async reprice(@Body() body: FlightRepriceDto, @CurrentUser() user?: any) {
    return this.service.repriceOffer(body, user?.id);
  }

  @Get('bookings')
  // QA 2026-09-09 R4: agents book via unified checkout but couldn't list their own
  // bookings (403). list() filters by user.id for non-admins.
  @UserTypes('customer', 'admin', 'agent')
  @ResponseMessage('Bookings list fetched.')
  async listBookings(@CurrentUser() user: any) {
    return this.service.list(user);
  }

  @Post('bookings/:id/cancel')
  @UserTypes('customer', 'admin')
  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('Flight booking cancelled.')
  async cancelBooking(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('reason') reason?: string,
  ) {
    const booking = await this.service.getBooking(id);
    if (booking) {
      this.assertOwnership(booking, user);
    }
    return this.service.cancelBooking(id, reason);
  }

  @Post('bookings/:id/void')
  @UserTypes('admin')
  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('Flight booking voided.')
  async voidBooking(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('reason') reason?: string,
  ) {
    const booking = await this.service.getBooking(id);
    if (booking) {
      this.assertOwnership(booking, user);
    }
    return this.service.voidBooking(id, reason);
  }

  @Post('bookings/:id/refund-quote')
  @UserTypes('admin')
  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('Refund quote fetched.')
  async quoteRefund(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    const booking = await this.service.getBooking(id);
    if (booking) {
      this.assertOwnership(booking, user);
    }
    return this.service.quoteRefund(id);
  }

  @Post('bookings/:id/refund-request')
  @UserTypes('admin')
  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('Refund request submitted.')
  async requestRefund(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('reason') reason?: string,
  ) {
    const booking = await this.service.getBooking(id);
    if (booking) {
      this.assertOwnership(booking, user);
    }
    return this.service.requestRefund(id, reason);
  }

  @Post('bookings/:id/receipt')
  @UserTypes('public')
  @UseGuards(GuestBookingGuard, RateLimitGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(tmpdir(), 'travelsota-uploads'),
        filename: (_req, file, cb) =>
          cb(
            null,
            `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
          ),
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (
          !file.mimetype.match(
            /^image\/(jpeg|png|gif|webp)$|^application\/pdf$/,
          )
        ) {
          cb(
            new BadRequestException(
              'Only JPEG, PNG, WebP, GIF images or PDF files are allowed (max 5MB).',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  @ResponseMessage('Payment receipt uploaded.')
  async uploadReceipt(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @UploadedFile() file?: { path: string },
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const url = await uploadFileToCloudinary(file.path, 'travelsota-receipts');
    return this.service.attachReceipt(id, url, user);
  }

  @Get('bookings/:id/progress')
  @UserTypes('public')
  @ResponseMessage('Booking progress retrieved.')
  async getBookingProgress(@Param('id') id: string, @CurrentUser() user?: any) {
    const booking = await this.service.getBooking(id);
    if (booking) {
      this.assertOwnership(booking, user);
    }
    return this.service.getBookingProgress(id);
  }

  @Get('bookings/:id')
  @UserTypes('public')
  @ResponseMessage('Booking details fetched.')
  async getBooking(@Param('id') id: string, @CurrentUser() user?: any) {
    const raw = await this.service.getBooking(id);
    if (raw) {
      this.assertOwnership(raw, user);
    }
    return Promise.resolve(raw).then((x) => this.mapper.toBookingDetailView(x));
  }

  // ── Manage Extras Endpoints (Phase 3) ──

  @Get('bookings/:id/extras/catalog')
  @UserTypes('customer', 'admin', 'agent')
  @ResponseMessage('Extras catalog fetched.')
  async getExtrasCatalog(@Param() params: ExtrasCatalogParamsDto) {
    const booking = await this.service.getBooking(params.id);
    if (!booking || !booking.locatorCode) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NOT_FOUND',
        'Booking not found or not yet booked.',
      );
    }
    const catalog = await this.postBookingExtrasService.catalog(booking);
    return catalog;
  }

  /**
   * Map DTO quote selections to ExtrasCatalogItem[] for the service.
   */
  private mapSelectionsToCatalogItems(body: ExtrasQuoteBodyDto): Array<{
    type: 'seat' | 'baggage' | 'meal' | 'service';
    ancillaryProductId: string;
    label: string;
    travelerRef?: string;
    segmentRef?: string;
    price: { amount: number; currency: string };
    catalogOfferingsIdentifier?: string;
    catalogOfferingIdentifier?: string;
  }> {
    return [
      ...(body.seats ?? []).map((s) => ({
        type: 'seat' as const,
        ancillaryProductId: s.ancillaryProductId,
        label: `Seat ${s.seatNumber}`,
        travelerRef: s.travelerRef,
        segmentRef: s.segmentRef,
        price: s.price,
        catalogOfferingsIdentifier: undefined,
        catalogOfferingIdentifier: undefined,
      })),
      ...(body.baggage ?? []).map((b) => ({
        type: 'baggage' as const,
        ancillaryProductId: b.ancillaryProductId,
        label: b.label,
        travelerRef: b.travelerRef,
        segmentRef: b.segmentRef,
        price: b.price,
        catalogOfferingsIdentifier: b.catalogOfferingsIdentifier,
        catalogOfferingIdentifier: b.catalogOfferingIdentifier,
      })),
      ...(body.meals ?? []).map((m) => ({
        type: 'meal' as const,
        ancillaryProductId: m.mealCode,
        label: m.mealName,
        travelerRef: m.travelerRef,
        segmentRef: m.segmentRef,
        price: m.price,
        catalogOfferingsIdentifier: undefined,
        catalogOfferingIdentifier: undefined,
      })),
      ...(body.services ?? []).map((s) => ({
        type: 'service' as const,
        ancillaryProductId: s.ancillaryProductId,
        label: s.label,
        travelerRef: s.travelerRef,
        segmentRef: s.segmentRef,
        price: s.price,
        catalogOfferingsIdentifier: s.catalogOfferingsIdentifier,
        catalogOfferingIdentifier: s.catalogOfferingIdentifier,
      })),
    ];
  }

  @Post('bookings/:id/extras/quote')
  @UserTypes('customer', 'admin', 'agent')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Extras quoted.')
  async quoteExtras(@Body() body: ExtrasQuoteBodyDto) {
    const booking = await this.service.getBooking(body.bookingId);
    if (!booking || !booking.locatorCode) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NOT_FOUND',
        'Booking not found or not yet booked.',
      );
    }

    // Build a fresh workbench from locator for quoting
    const workbench =
      await this.postBookingExtrasService.buildWorkbenchFromLocator(
        booking.locatorCode,
      );
    if (!workbench?.workbenchId) {
      throw new BusinessError(
        'FLIGHTS_EXTRAS_WORKBENCH_FAILED',
        'Could not create workbench for extras quoting.',
      );
    }

    const selections = this.mapSelectionsToCatalogItems(body);
    const quote = await this.postBookingExtrasService.quote(
      booking,
      workbench,
      selections,
    );
    if (!quote) {
      throw new BusinessError(
        'FLIGHTS_EXTRAS_QUOTE_FAILED',
        'Could not quote selected extras.',
      );
    }

    return quote;
  }

  @Post('bookings/:id/extras/payment')
  @UserTypes('customer', 'admin', 'agent')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Extras payment created.')
  async payForExtras(@Body() body: ExtrasPaymentBodyDto) {
    const booking = await this.service.getBooking(body.bookingId);
    if (!booking || !booking.locatorCode) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NOT_FOUND',
        'Booking not found or not yet booked.',
      );
    }

    const totalAmount = booking.extrasTotalAmount ?? 0;
    const currency = booking.extrasCurrency ?? 'USD';

    const payment = await this.postBookingExtrasService.pay(
      booking,
      body.gateway,
      totalAmount,
      currency,
      body.successUrl,
      body.cancelUrl,
    );

    return payment;
  }

  @Post('bookings/:id/extras/confirm')
  @UserTypes('customer', 'admin', 'agent')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Extras confirmed with supplier.')
  async confirmExtras(@Body() body: ExtrasConfirmBodyDto) {
    const booking = await this.service.getBooking(body.bookingId);
    if (!booking || !booking.locatorCode) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NOT_FOUND',
        'Booking not found or not yet booked.',
      );
    }

    // Build a fresh workbench from locator
    const workbench =
      await this.postBookingExtrasService.buildWorkbenchFromLocator(
        booking.locatorCode,
      );
    if (!workbench?.workbenchId) {
      throw new BusinessError(
        'FLIGHTS_EXTRAS_WORKBENCH_FAILED',
        'Could not create workbench for extras confirm.',
      );
    }

    const result = await this.postBookingExtrasService.confirm(
      booking,
      body.items.map((i) => ({
        type: i.type,
        ancillaryProductId: i.ancillaryProductId,
        label: i.label,
        travelerRef: i.travelerRef,
        segmentRef: i.segmentRef,
        seatNumber: i.seatNumber,
        mealCode: i.mealCode,
        catalogOfferingsIdentifier: i.catalogOfferingsIdentifier,
        catalogOfferingIdentifier: i.catalogOfferingIdentifier,
        price: i.price ?? { amount: 0, currency: 'USD' },
      })),
      workbench,
    );

    return result;
  }

  @Get('bookings/:id/extras/status')
  @UserTypes('customer', 'admin', 'agent')
  @ResponseMessage('Extras status fetched.')
  async getExtrasStatus(@Param() params: ExtrasStatusParamsDto) {
    return this.postBookingExtrasService.getStatus(params.id);
  }
}
