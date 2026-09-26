import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { BusinessError } from '../../../shared/errors/business-error';
import type { HotelProvider } from '../domain/interfaces/hotel-provider.interface';
import type {
  ProviderStatus,
  HotelSearchInput,
  NormalizedHotelSearchResponse,
  NormalizedHotelSummary,
  HotelDetailsInput,
  NormalizedHotelDetailsResponse,
  NormalizedHotelRate,
  HotelRateValidationInput,
  ValidatedHotelRate,
  HotelCreateBookingInput,
  HotelSupplierBookingResult,
  HotelBookingStatusInput,
  HotelSupplierBookingStatus,
  HotelRetrieveBookingInput,
  HotelSupplierBookingDetails,
  HotelCancelBookingInput,
  HotelSupplierCancelResult,
} from '../domain/types/hotel-provider.types';

@Injectable()
export class ManualHotelProvider implements HotelProvider {
  readonly key = 'manual' as const;
  readonly capabilities = {
    supportsPrePaymentHold: false,
    supportsHoldCancellation: true,
    requiresInstantPayment: true,
    // Admin-entered room basePrice is a per-night rate — the booking pipeline
    // multiplies by the night count. Supplier APIs (Hotelbeds/RateHawk/Amadeus)
    // quote stay totals and leave this flag unset (false).
    ratesArePerNight: true,
  } as const;
  private readonly logger = new Logger(ManualHotelProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  async checkStatus(): Promise<ProviderStatus> {
    try {
      const count = await this.prisma.manualHotel.count({ where: { status: 'active' } });
      return { ok: true, provider: 'manual', upstreamStatus: count > 0 ? 200 : 204 };
    } catch {
      return { ok: false, provider: 'manual' };
    }
  }

  async search(input: HotelSearchInput): Promise<NormalizedHotelSearchResponse> {
    const where: any = { status: 'active' };

    if (input.destinationCode) {
      where.destinationCode = input.destinationCode;
    }

    if (input.destinationName) {
      where.destinationName = { contains: input.destinationName, mode: 'insensitive' };
    }

    if (input.hotelName) {
      where.name = { contains: input.hotelName, mode: 'insensitive' };
    }

    if (input.hotelCodes?.length) {
      where.id = { in: input.hotelCodes.map(String) };
    }

    if (input.geolocation) {
      where.AND = [
        { latitude: { not: null } },
        { longitude: { not: null } },
      ];
    }

    const hotels = await this.prisma.manualHotel.findMany({
      where,
      include: {
        rooms: {
          where: { status: 'active' },
          orderBy: { basePrice: 'asc' },
        },
      },
      orderBy: { hotelOrder: 'asc' },
      take: 100,
    });

    const summaries: NormalizedHotelSummary[] = hotels.map((h) => {
      const minPriceRoom = h.rooms[0];
      const minRate: NormalizedHotelSummary['minRate'] = minPriceRoom
        ? {
            rateId: `manual:${h.id}:${minPriceRoom.id}:${input.checkIn}:${input.checkOut}`,
            total: minPriceRoom.basePrice,
            currency: minPriceRoom.currency,
            boardName: minPriceRoom.boardType ?? undefined,
            cancellationPolicyText: minPriceRoom.cancellationFree ? 'Free cancellation' : undefined,
            adults: minPriceRoom.maxAdults,
            children: minPriceRoom.maxChildren,
          }
        : undefined;

      const imageUrls = ((h.images as any[]) ?? []).map((img: any) => img.url ?? img);

      return {
        hotelId: h.id,
        providerHotelId: h.id,
        name: h.name,
        destinationCode: h.destinationCode ?? undefined,
        destinationName: h.destinationName ?? h.location,
        categoryName: h.accommodationType ?? undefined,
        latitude: h.latitude?.toString(),
        longitude: h.longitude?.toString(),
        images: imageUrls.length > 0 ? imageUrls : undefined,
        amenities: (h.amenities as string[]) ?? undefined,
        minRate,
        roomsCount: h.rooms.length,
      };
    });

    return {
      provider: 'manual',
      hotels: summaries,
      meta: { checkIn: input.checkIn, checkOut: input.checkOut, total: summaries.length },
    };
  }

  async getHotelDetails(input: HotelDetailsInput): Promise<NormalizedHotelDetailsResponse> {
    const hotel = await this.prisma.manualHotel.findUnique({
      where: { id: input.hotelId },
      include: {
        rooms: {
          where: { status: 'active' },
          orderBy: { basePrice: 'asc' },
        },
      },
    });

    if (!hotel) {
      throw new BusinessError(
        'MANUAL_HOTEL_NOT_FOUND',
        `Manual hotel "${input.hotelId}" not found`,
      );
    }

    const imageUrls = ((hotel.images as any[]) ?? []).map((img: any) => img.url ?? img);

    const rates: NormalizedHotelRate[] = hotel.rooms.map((room) => ({
      rateId: `manual:${hotel.id}:${room.id}:TBD:TBD`,
      roomName: room.name,
      boardName: room.boardType ?? undefined,
      paymentType: 'merchant',
      supplierAmount: room.basePrice,
      supplierCurrency: room.currency,
      customerAmount: room.basePrice,
      customerCurrency: room.currency,
      cancellationPolicyText: room.cancellationFree ? 'Free cancellation' : undefined,
      refundable: room.refundable,
      adults: room.maxAdults,
      children: room.maxChildren,
    }));

    return {
      provider: 'manual',
      searchKey: input.searchKey,
      hotelId: hotel.id,
      providerHotelId: hotel.id,
      name: hotel.name,
      images: imageUrls.length > 0 ? imageUrls : undefined,
      amenities: (hotel.amenities as string[]) ?? undefined,
      description: hotel.description ?? undefined,
      address: hotel.address ?? undefined,
      rates,
    };
  }

  async validateRate(input: HotelRateValidationInput): Promise<ValidatedHotelRate> {
    const decoded = decodeURIComponent(input.rateId);
    const parts = decoded.split(':');
    if (parts.length < 3 || parts[0] !== 'manual') {
      throw new BusinessError('INVALID_RATE_ID', `Invalid manual rate ID: ${input.rateId}`);
    }

    const hotelId = parts[1];
    const roomId = parts[2];

    const room = await this.prisma.manualHotelRoom.findUnique({
      where: { id: roomId },
      include: { hotel: true },
    });

    if (!room || room.status !== 'active' || room.hotel.status !== 'active') {
      throw new BusinessError('RATE_UNAVAILABLE', 'Room or hotel is no longer available');
    }

    if (room.availableQuantity < 1) {
      throw new BusinessError('ROOM_SOLD_OUT', 'Room is sold out');
    }

    return {
      rateId: input.rateId,
      provider: 'manual',
      supplierAmount: room.basePrice,
      supplierCurrency: room.currency,
      currency: room.currency,
      rooms: [{
        rates: [{
          rateKey: input.rateId,
          net: room.basePrice,
          adults: room.maxAdults,
          children: room.maxChildren,
        }],
      }],
    };
  }

  async createBooking(input: HotelCreateBookingInput): Promise<HotelSupplierBookingResult> {
    const decoded = decodeURIComponent(input.rateId);
    const parts = decoded.split(':');
    const hotelId = parts[1];
    const roomId = parts[2];

    const room = await this.prisma.manualHotelRoom.findUnique({
      where: { id: roomId },
      include: { hotel: true },
    });

    if (!room || room.status !== 'active') {
      throw new BusinessError('RATE_UNAVAILABLE', 'Room is no longer available');
    }

    if (room.availableQuantity < 1) {
      throw new BusinessError('ROOM_SOLD_OUT', 'Room is sold out');
    }

    const bookingId = `MH-${Date.now().toString(36).substring(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    await this.prisma.manualHotelRoom.update({
      where: { id: roomId },
      data: { availableQuantity: { decrement: 1 } },
    });

    return {
      provider: 'manual',
      booking: {
        reference: bookingId,
        status: 'confirmed',
        holder: input.holder,
        hotel: {
          hotelId: room.hotelId,
          name: room.hotel.name,
          destinationName: room.hotel.destinationName ?? room.hotel.location,
        },
        rooms: [{
          roomName: room.name,
          boardName: room.boardType,
          adults: room.maxAdults,
          children: room.maxChildren,
        }],
        price: {
          totalNet: room.basePrice,
          currency: room.currency,
        },
        cancellationAllowed: room.cancellationFree,
        modificationAllowed: false,
      },
    };
  }

  async checkBookingStatus(_input: HotelBookingStatusInput): Promise<HotelSupplierBookingStatus> {
    return {
      provider: 'manual',
      reference: _input.supplierReference,
      status: 'confirmed',
      supplierStatus: 'synchronous',
    };
  }

  async retrieveBooking(input: HotelRetrieveBookingInput): Promise<HotelSupplierBookingDetails> {
    return {
      provider: 'manual',
      booking: {
        reference: input.reference,
        status: 'confirmed',
        holder: {},
        hotel: null,
        rooms: [],
        price: { totalNet: null, currency: null },
      },
      raw: null,
    };
  }

  async cancelBooking(input: HotelCancelBookingInput): Promise<HotelSupplierCancelResult> {
    if (input.bookingId) {
      const booking = await this.prisma.hotelBooking.findUnique({
        where: { id: input.bookingId },
        select: { hotelSnapshot: true },
      });
      const snap = (booking?.hotelSnapshot ?? {}) as any;
      const roomId = snap.manualRoomId as string | undefined;
      if (roomId) {
        try {
          await this.prisma.manualHotelRoom.update({
            where: { id: roomId },
            data: { availableQuantity: { increment: 1 } },
          });
        } catch {
          this.logger.warn(`Could not restore inventory for room ${roomId}`);
        }
      }
    }

    return {
      provider: 'manual',
      reference: input.reference,
      status: 'cancelled',
      message: 'Cancelled.',
    };
  }
}
