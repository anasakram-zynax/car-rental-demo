import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Patch,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  AgentBookingService,
  type AgentBookingListItem,
  type AgentBookingDetail,
  type PaginatedAgentBookings,
  type SearchInput,
  type CreateBookingInput,
  type MarkedUpOffer,
} from './agent-booking.service';
import { BusinessError } from '../../shared/errors/business-error';
import { UserTypes } from '../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../../shared/database/prisma.service';
import { IsString, IsOptional, IsNumber, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { FlightsProviderRegistryService } from '../flights/application/services/flights-provider-registry.service';
import { HotelsProviderRegistryService } from '../hotels/providers/registry/hotels-provider-registry.service';
import { CreatePaymentIntentUseCase } from '../payment/application/use-cases/create-payment-intent.use-case';
import { BookingType } from '../payment/domain/enums/booking-type.enum';
import { PaymentGateway } from '../payment/domain/enums/payment-gateway.enum';
import { MarkupService } from '../markup/markup.service';
import { FlightOfferSnapshotService } from '../flights/application/services/flight-offer-snapshot.service';
import { AuthGuard } from '@nestjs/passport';
import { AgentAuthGuard } from '../agent-panel/api/guards/agent-auth.guard';

// ── DTOs ──────────────────────────────────────────────────────────

class SearchDto {
  @IsString() @IsIn(['flight', 'hotel']) type: 'flight' | 'hotel';
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() departureDate?: string;
  @IsOptional() @IsString() returnDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) adults?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) children?: number;
  @IsOptional() body?: any;
}

class CheckoutDto {
  @IsString() @IsIn(['flight', 'hotel']) type: 'flight' | 'hotel';
  /** Originating supplier for this rate (amadeus/hotelbeds/ratehawk) — persisted on the booking so the payment listener books with the same provider. */
  @IsOptional() @IsString() provider?: string;
  @IsNumber() @Min(0.01) totalPrice: number;
  @IsString() currency: string;
  @IsOptional() @IsString() offerId?: string;
  @IsOptional() @IsString() rateKey?: string;
  @IsOptional() holder?: any;
  @IsOptional() paxes?: any[];
  @IsOptional() travelers?: any[];
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() departureDate?: string;
  @IsOptional() @IsString() tripType?: string;
  @IsOptional() offerSnapshot?: any;
  @IsOptional() @IsString() clientReference?: string;
  @IsOptional() @IsString() searchKey?: string;
  @IsOptional() @IsString() @IsIn(['STRIPE', 'PAYPAL']) gateway?: string;
  @IsOptional() @IsString() successUrl?: string;
  @IsOptional() @IsString() cancelUrl?: string;
}

class CreateBookingDto {
  @IsString() @IsIn(['flight', 'hotel']) type: 'flight' | 'hotel';
  /** Originating supplier for this rate (amadeus/hotelbeds/ratehawk) — persisted on the booking so the payment listener books with the same provider. */
  @IsOptional() @IsString() provider?: string;
  @IsNumber() @Min(0.01) totalPrice: number;
  @IsString() currency: string;
  @IsOptional() @IsString() offerId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() rateKey?: string;
  @IsOptional() holder?: any;
  @IsOptional() paxes?: any[];
  @IsOptional() travelers?: any[];
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() departureDate?: string;
  @IsOptional() @IsString() tripType?: string;
  @IsOptional() offerSnapshot?: any;
  @IsOptional() @IsString() clientReference?: string;
  @IsOptional() @IsString() searchKey?: string;
}

class CancelBookingDto {
  @IsOptional() @IsString() reason?: string;
}

class ModifyBookingDto {
  @IsString() type: string; // 'date_change' | 'passenger_change' | 'upgrade'
  @IsOptional() reason?: string;
  @IsOptional() newValue?: any;
}

class ApplyMarkupDto {
  @IsString() @IsIn(['flight', 'hotel']) type: 'flight' | 'hotel';
  @IsOptional() results?: any;
  @IsOptional() @IsString() routeFrom?: string;
  @IsOptional() @IsString() routeTo?: string;
}

class BookingsQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) limit?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() @IsIn(['flight', 'hotel']) type?: string;
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string;
}

// ── Provider Normalizers ─────────────────────────────────────────
// These convert provider-specific result shapes into the simple "agent flat format"
// expected by searchWithMarkups() and the frontend components.

interface NormalizedTravelportSegment {
  from: string;
  to: string;
  departureAt?: string;
  arrivalAt?: string;
  duration?: string;
  flightNumber?: string;
  carrier?: string;
  marketingCarrier?: string;
}

interface NormalizedFlightOffer {
  id: string;
  offerId?: string;
  productId?: string;
  productIds?: string[];
  offeringIdentifierValue?: string;
  productSelections?: Array<{ offeringId: string; productIds: string[] }>;
  totalPrice: number;
  currency: string;
  airline: string;
  flightNumber?: string;
  from: string;
  to: string;
  departureDate: string;
  arrivalDate: string;
  cabinClass?: string;
  duration?: string;
  stops: number;
  segments?: NormalizedTravelportSegment[];
  provider: string;
  catalogUuid?: string;
  metadata?: any;
}

interface NormalizedHotelRateEntry {
  rateKey: string;
  net: number;
  totalRate: number;
  currency: string;
  boardType?: string;
  adults?: number;
  paymentType?: string;
  agentPrice?: number;
  basePrice?: number;
  markupPercent?: number;
}

interface NormalizedHotelRoom {
  code: string;
  name: string;
  rates: NormalizedHotelRateEntry[];
}

interface NormalizedHotelResult {
  code: string;
  name: string;
  category: string;
  destinationName?: string;
  rooms: NormalizedHotelRoom[];
}

function buildISOFromDateAndTime(
  date?: string,
  time?: string,
): string | undefined {
  if (!date) return undefined;
  // date is "YYYY-MM-DD", time is "HH:MM:SS" or "HH:MM"
  if (time) {
    const padded = time.includes(':') ? time : `${time}:00`;
    return `${date}T${padded}Z`;
  }
  return `${date}T00:00:00Z`;
}

function normalizeTravelportOffer(
  offer: any,
  catalogUuid?: string,
): NormalizedFlightOffer | null {
  const price = offer.price;
  const totalPrice = price?.total ?? offer.totalPrice ?? 0;
  if (typeof totalPrice !== 'number' || totalPrice <= 0) return null;

  const segments: any[] = Array.isArray(offer.segments) ? offer.segments : [];
  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];

  const airline =
    offer.airline ||
    firstSeg?.carrier ||
    firstSeg?.operatingCarrier ||
    'Airline';
  const flightNumber = offer.flightNumber || firstSeg?.flightNumber;
  const from = offer.from || firstSeg?.departure?.airport;
  const to = offer.to || lastSeg?.arrival?.airport;
  const cabinClass = offer.cabin || offer.cabinClass;

  const departureDate =
    buildISOFromDateAndTime(
      firstSeg?.departure?.date,
      firstSeg?.departure?.time,
    ) ||
    offer.departureDate ||
    '';

  const arrivalDate =
    buildISOFromDateAndTime(lastSeg?.arrival?.date, lastSeg?.arrival?.time) ||
    offer.arrivalDate ||
    '';

  const mappedSegments: NormalizedTravelportSegment[] = segments.map(
    (s: any) => ({
      from: s.departure?.airport || '',
      to: s.arrival?.airport || '',
      departureAt: buildISOFromDateAndTime(
        s.departure?.date,
        s.departure?.time,
      ),
      arrivalAt: buildISOFromDateAndTime(s.arrival?.date, s.arrival?.time),
      duration: s.duration,
      flightNumber: s.flightNumber,
      carrier: s.carrier,
      marketingCarrier: s.carrier,
    }),
  );

  return {
    id: offer.id || `offer-${Math.random().toString(36).slice(2, 9)}`,
    offerId: offer.offerId ?? offer.id ?? undefined,
    productId: offer.metadata?.productRef ?? offer.productId ?? undefined,
    productIds: Array.isArray(offer.metadata?.productRefs)
      ? offer.metadata.productRefs
      : Array.isArray(offer.productIds)
        ? offer.productIds
        : undefined,
    offeringIdentifierValue:
      offer.metadata?.offeringIdentifierValue ??
      offer.offeringIdentifierValue ??
      undefined,
    productSelections: Array.isArray(offer.metadata?.productSelections)
      ? offer.metadata.productSelections
      : Array.isArray(offer.productSelections)
        ? offer.productSelections
        : undefined,
    totalPrice,
    currency: price?.currency || 'USD',
    airline,
    flightNumber,
    from,
    to,
    departureDate,
    arrivalDate,
    cabinClass,
    duration: offer.totalDuration || offer.duration,
    stops:
      typeof offer.stops === 'number'
        ? offer.stops
        : Math.max(segments.length - 1, 0),
    segments: mappedSegments.length > 0 ? mappedSegments : undefined,
    provider: offer.provider || 'travelport',
    catalogUuid,
    metadata: offer.metadata || {
      productRef: offer.metadata?.productRef,
      offeringId: offer.metadata?.offeringId,
    },
  };
}

function mapBoardType(boardName?: string): string | undefined {
  if (!boardName) return undefined;
  const upper = boardName.toUpperCase();
  if (upper.includes('ROOM ONLY') || upper === 'RO') return 'RO';
  if (upper.includes('BED & BREAKFAST') || upper === 'BB') return 'BB';
  if (upper.includes('HALF BOARD') || upper === 'HB') return 'HB';
  if (upper.includes('FULL BOARD') || upper === 'FB') return 'FB';
  if (upper.includes('ALL INCLUSIVE') || upper === 'AI') return 'AI';
  return boardName;
}

function normalizeHotelbedsResult(hotel: any): NormalizedHotelResult | null {
  // If already in mock format (has rooms[]), pass through
  if (Array.isArray(hotel.rooms) && hotel.rooms.length > 0) {
    return {
      code: hotel.code || hotel.hotelId || '',
      name: hotel.name || 'Unknown Hotel',
      category: hotel.category || hotel.categoryName || '',
      destinationName: hotel.destinationName,
      rooms: hotel.rooms,
    };
  }

  // Convert from Hotelbeds normalized format (has rates[]) to mock format (rooms[].rates[])
  const rates = Array.isArray(hotel.rates) ? hotel.rates : [];
  if (rates.length === 0) return null;

  // Group rates by room name/code for the rooms[].rates[] structure
  const roomMap = new Map<string, any[]>();

  for (const rate of rates) {
    const roomName = rate.roomName || 'Standard Room';
    const roomCode =
      rate.rateKey?.split('|')[4] ||
      roomName.replace(/\s+/g, '-').toUpperCase();

    if (!roomMap.has(roomCode)) {
      roomMap.set(roomCode, []);
    }

    roomMap.get(roomCode)!.push({
      rateKey: rate.rateKey ?? rate.rateId ?? '',
      net:
        typeof rate.supplierAmount === 'number'
          ? rate.supplierAmount
          : typeof rate.net === 'number'
            ? rate.net
            : 0,
      totalRate:
        typeof rate.supplierAmount === 'number'
          ? rate.supplierAmount
          : typeof rate.net === 'number'
            ? rate.net
            : 0,
      currency: rate.supplierCurrency ?? rate.currency ?? 'USD',
      boardType: mapBoardType(rate.boardName),
      adults: rate.adults ?? 1,
      paymentType: rate.paymentType,
    });
  }

  const rooms: any[] = [];
  for (const [code, roomRates] of roomMap.entries()) {
    const firstRate = roomRates[0];
    rooms.push({
      code,
      name: firstRate.roomName || 'Standard Room',
      rates: roomRates,
    });
  }

  return {
    code: hotel.code || hotel.hotelId || '',
    name: hotel.name || 'Unknown Hotel',
    category: hotel.categoryName || hotel.category || '',
    destinationName: hotel.destinationName,
    rooms,
  };
}

// ── Controller ────────────────────────────────────────────────────

@Controller('agent/bookings')
@UseGuards(AuthGuard('jwt'), AgentAuthGuard)
@UserTypes('agent')
export class AgentBookingsController {
  private readonly logger = new Logger(AgentBookingsController.name);

  constructor(
    private readonly bookingService: AgentBookingService,
    private readonly prisma: PrismaService,
    private readonly flightProviderRegistry: FlightsProviderRegistryService,
    private readonly hotelsProviderRegistry: HotelsProviderRegistryService,
    private readonly createPaymentIntentUseCase: CreatePaymentIntentUseCase,
    private readonly markupService: MarkupService,
    private readonly snapshotService: FlightOfferSnapshotService,
  ) {}

  @Get()
  @ResponseMessage('Bookings list retrieved.')
  async list(
    @CurrentUser() user: { id: string },
    @Query() query: BookingsQueryDto,
  ): Promise<PaginatedAgentBookings | { message: string }> {
    return this.bookingService.getAgentBookings(user.id, query);
  }

  @Patch(':id/cancel')
  @ResponseMessage('Booking cancellation request submitted.')
  async cancel(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
  ): Promise<any> {
    return this.bookingService.cancelBooking(id, user.id, dto.reason, 'agent');
  }

  @Patch(':id/modify')
  @ResponseMessage('Modification request submitted.')
  async modify(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: ModifyBookingDto,
  ): Promise<any> {
    return this.bookingService.modifyBooking(id, user.id, dto, 'agent');
  }

  @Get(':id')
  @ResponseMessage('Booking detail retrieved.')
  async detail(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ): Promise<AgentBookingDetail | { message: string }> {
    const booking = await this.bookingService.getAgentBookingDetail(
      id,
      user.id,
    );
    if (!booking) return { message: 'Booking not found' };
    return booking;
  }

  private async resolveProfileId(userId: string): Promise<string | null> {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

}
