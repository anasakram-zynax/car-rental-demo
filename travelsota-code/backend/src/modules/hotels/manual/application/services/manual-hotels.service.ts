import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/database/prisma.service';
import { BusinessError } from '../../../../../shared/errors/business-error';
import type { CreateManualHotelDto } from '../../api/dto/create-manual-hotel.dto';
import type { UpdateManualHotelDto } from '../../api/dto/update-manual-hotel.dto';
import type { UpdateManualHotelRoomDto } from '../../api/dto/update-manual-hotel-room.dto';

@Injectable()
export class ManualHotelsService {
  private readonly logger = new Logger(ManualHotelsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(page: number = 1, pageSize: number = 20, search?: string) {
    const skip = (page - 1) * pageSize;
    const term = search?.trim();
    // Case-insensitive contains on name + location; PostgreSQL Prisma
    // supports `mode: 'insensitive'` natively.
    const where = {
      status: { not: 'inactive' },
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' as const } },
              { location: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.manualHotel.findMany({
        where,
        include: { _count: { select: { rooms: true } } },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.manualHotel.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getById(id: string) {
    const hotel = await this.prisma.manualHotel.findUnique({
      where: { id },
      include: {
        rooms: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!hotel) {
      throw new BusinessError('MANUAL_HOTEL_NOT_FOUND', `Manual hotel with id "${id}" not found`);
    }
    return hotel;
  }

  async create(dto: CreateManualHotelDto, userId?: string) {
    const slug = await this.generateSlug(dto.slug ?? dto.name);

    return this.prisma.$transaction(async (tx) => {
      const hotel = await tx.manualHotel.create({
        data: {
          name: dto.name,
          slug,
          status: dto.status ?? 'active',
          featured: dto.featured ?? false,
          hotelOrder: dto.hotelOrder ?? 0,
          stars: dto.stars,
          rating: dto.rating,
          accommodationType: dto.accommodationType,
          description: dto.description,
          currency: dto.currency ?? 'USD',
          discount: dto.discount,
          refundable: dto.refundable ?? false,
          checkinTime: dto.checkinTime ?? '14:00',
          checkoutTime: dto.checkoutTime ?? '12:00',
          bookingAgeRequirement: dto.bookingAgeRequirement ?? 18,
          email: dto.email,
          phone: dto.phone,
          website: dto.website,
          location: dto.location,
          address: dto.address,
          latitude: dto.latitude,
          longitude: dto.longitude,
          metaTitle: dto.metaTitle,
          metaKeywords: dto.metaKeywords,
          metaDesc: dto.metaDesc,
          cancellationPolicy: dto.cancellationPolicy,
          privacyPolicy: dto.privacyPolicy,
          amenities: dto.amenities ?? [],
          images: dto.images ?? [],
          translations: {},
          destinationCode: dto.destinationCode,
          destinationName: dto.destinationName,
          userId,
        },
      });

      if (dto.rooms?.length) {
        await tx.manualHotelRoom.createMany({
          data: dto.rooms.map((r) => ({
            hotelId: hotel.id,
            name: r.name,
            roomType: r.roomType,
            description: r.description,
            maxAdults: r.maxAdults ?? 2,
            maxChildren: r.maxChildren ?? 0,
            basePrice: r.basePrice,
            currency: r.currency ?? 'USD',
            discountPercent: r.discountPercent,
            extraBedAvailable: r.extraBedAvailable ?? false,
            extraBedCharge: r.extraBedCharge,
            breakfastIncluded: r.breakfastIncluded ?? false,
            cancellationFree: r.cancellationFree ?? false,
            refundable: r.refundable ?? false,
            availableQuantity: r.availableQuantity ?? 1,
            boardType: r.boardType,
            amenities: r.amenities ?? [],
            images: r.images ?? [],
            translations: {},
          })),
        });
      }

      return tx.manualHotel.findUnique({
        where: { id: hotel.id },
        include: { rooms: true },
      });
    });
  }

  async update(id: string, dto: UpdateManualHotelDto) {
    await this.getById(id);

    const data: Record<string, unknown> = {};
    const simpleFields: (keyof UpdateManualHotelDto)[] = [
      'name', 'status', 'featured', 'hotelOrder', 'stars', 'rating',
      'accommodationType', 'description', 'currency', 'discount', 'refundable',
      'checkinTime', 'checkoutTime', 'bookingAgeRequirement', 'email', 'phone',
      'website', 'location', 'address', 'latitude', 'longitude',
      'metaTitle', 'metaKeywords', 'metaDesc', 'cancellationPolicy', 'privacyPolicy',
      'destinationCode', 'destinationName',
    ];

    for (const field of simpleFields) {
      if (dto[field] !== undefined) {
        data[field] = dto[field];
      }
    }

    if (dto.amenities !== undefined) data['amenities'] = dto.amenities;
    if (dto.images !== undefined) data['images'] = dto.images;

    if (dto.slug !== undefined && dto.slug !== '') {
      data['slug'] = await this.generateSlug(dto.slug);
    } else if (dto.name !== undefined) {
      data['slug'] = await this.generateSlug(dto.name);
    }

    return this.prisma.manualHotel.update({
      where: { id },
      data,
      include: { rooms: true },
    });
  }

  async softDelete(id: string) {
    await this.getById(id);
    return this.prisma.manualHotel.update({
      where: { id },
      data: { status: 'inactive' },
    });
  }

  async addRoom(hotelId: string, dto: { name: string; basePrice: number; [key: string]: unknown }) {
    await this.getById(hotelId);

    const room = await this.prisma.manualHotelRoom.create({
      data: {
        hotelId,
        name: dto.name,
        roomType: (dto.roomType as string) ?? null,
        description: (dto.description as string) ?? null,
        maxAdults: (dto.maxAdults as number) ?? 2,
        maxChildren: (dto.maxChildren as number) ?? 0,
        basePrice: dto.basePrice as number,
        currency: (dto.currency as string) ?? 'USD',
        discountPercent: (dto.discountPercent as number) ?? null,
        extraBedAvailable: (dto.extraBedAvailable as boolean) ?? false,
        extraBedCharge: (dto.extraBedCharge as number) ?? null,
        breakfastIncluded: (dto.breakfastIncluded as boolean) ?? false,
        cancellationFree: (dto.cancellationFree as boolean) ?? false,
        refundable: (dto.refundable as boolean) ?? false,
        availableQuantity: (dto.availableQuantity as number) ?? 1,
        boardType: (dto.boardType as string) ?? null,
        amenities: (dto.amenities as any) ?? [],
        images: (dto.images as any) ?? [],
        translations: {},
      },
    });

    return room;
  }

  async updateRoom(roomId: string, dto: UpdateManualHotelRoomDto) {
    const existing = await this.prisma.manualHotelRoom.findUnique({ where: { id: roomId } });
    if (!existing) {
      throw new BusinessError('MANUAL_HOTEL_ROOM_NOT_FOUND', `Room with id "${roomId}" not found`);
    }

    const data: Record<string, unknown> = {};
    const simpleFields: (keyof UpdateManualHotelRoomDto)[] = [
      'name', 'roomType', 'description', 'maxAdults', 'maxChildren',
      'basePrice', 'currency', 'discountPercent', 'extraBedAvailable',
      'extraBedCharge', 'breakfastIncluded', 'cancellationFree', 'refundable',
      'availableQuantity', 'boardType', 'status',
    ];

    for (const field of simpleFields) {
      if (dto[field] !== undefined) {
        data[field] = dto[field];
      }
    }

    if (dto.amenities !== undefined) data['amenities'] = dto.amenities;
    if (dto.images !== undefined) data['images'] = dto.images;

    return this.prisma.manualHotelRoom.update({
      where: { id: roomId },
      data,
    });
  }

  async softDeleteRoom(roomId: string) {
    const existing = await this.prisma.manualHotelRoom.findUnique({ where: { id: roomId } });
    if (!existing) {
      throw new BusinessError('MANUAL_HOTEL_ROOM_NOT_FOUND', `Room with id "${roomId}" not found`);
    }
    return this.prisma.manualHotelRoom.update({
      where: { id: roomId },
      data: { status: 'inactive' },
    });
  }

  async getFeatured() {
    return this.prisma.manualHotel.findMany({
      where: { featured: true, status: 'active' },
      include: {
        rooms: {
          where: { status: 'active' },
          orderBy: { basePrice: 'asc' },
        },
      },
      orderBy: { hotelOrder: 'asc' },
      take: 20,
    });
  }

  private async generateSlug(input: string): Promise<string> {
    let slug = input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 200);

    if (!slug) slug = 'hotel';

    let uniqueSlug = slug;
    let suffix = 1;
    while (await this.prisma.manualHotel.findUnique({ where: { slug: uniqueSlug } })) {
      uniqueSlug = `${slug}-${suffix}`;
      suffix++;
    }

    return uniqueSlug;
  }
}
