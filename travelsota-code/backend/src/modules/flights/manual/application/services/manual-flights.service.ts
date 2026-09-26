import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/database/prisma.service';
import { BusinessError } from '../../../../../shared/errors/business-error';
import type { CreateManualFlightDto } from '../../api/dto/create-manual-flight.dto';
import type { UpdateManualFlightDto } from '../../api/dto/update-manual-flight.dto';

@Injectable()
export class ManualFlightsService {
  private readonly logger = new Logger(ManualFlightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(page = 1, pageSize = 20, search?: string) {
    const skip = (page - 1) * pageSize;
    const term = search?.trim();
    const where = {
      status: { not: 'inactive' },
      ...(term
        ? {
            OR: [
              { originId: { contains: term, mode: 'insensitive' as const } },
              { destinationId: { contains: term, mode: 'insensitive' as const } },
              { originCity: { contains: term, mode: 'insensitive' as const } },
              { destinationCity: { contains: term, mode: 'insensitive' as const } },
              { airlineName: { contains: term, mode: 'insensitive' as const } },
              { flightNumber: { contains: term, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.manualFlight.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.manualFlight.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getById(id: string) {
    const flight = await this.prisma.manualFlight.findUnique({ where: { id } });
    if (!flight) throw new BusinessError('MANUAL_FLIGHT_NOT_FOUND', `Manual flight "${id}" not found`);
    return flight;
  }

  async create(dto: CreateManualFlightDto, userId?: string) {
    return this.prisma.manualFlight.create({
      data: {
        airlineId: dto.airlineId,
        airlineName: dto.airlineName,
        flightNumber: dto.flightNumber,
        originId: dto.originId,
        originCity: dto.originCity,
        destinationId: dto.destinationId,
        destinationCity: dto.destinationCity,
        departureDate: new Date(dto.departureDate),
        departureTime: dto.departureTime,
        arrivalDate: dto.arrivalDate ? new Date(dto.arrivalDate) : null,
        arrivalTime: dto.arrivalTime,
        duration: dto.duration,
        status: dto.status ?? 'active',
        featured: dto.featured ?? false,
        flightOrder: dto.flightOrder ?? 0,
        basePrice: dto.basePrice,
        currency: dto.currency ?? 'USD',
        childPricePercent: dto.childPricePercent ?? 75,
        infantPricePercent: dto.infantPricePercent ?? 10,
        availableSeats: dto.availableSeats ?? 50,
        totalSeats: dto.totalSeats ?? 50,
        refundable: dto.refundable ?? false,
        cabinClass: dto.cabinClass ?? 'economy',
        hasWifi: dto.hasWifi ?? false,
        hasMeal: dto.hasMeal ?? false,
        hasEntertainment: dto.hasEntertainment ?? false,
        hasPowerOutlet: dto.hasPowerOutlet ?? false,
        checkedBaggage: dto.checkedBaggage,
        cabinBaggage: dto.cabinBaggage,
        userId,
      },
    });
  }

  async update(id: string, dto: UpdateManualFlightDto) {
    await this.getById(id);
    const data: Record<string, unknown> = {};
    const fields: (keyof UpdateManualFlightDto)[] = [
      'airlineId', 'airlineName', 'flightNumber', 'originId', 'originCity',
      'destinationId', 'destinationCity', 'departureTime', 'arrivalTime',
      'duration', 'status', 'featured', 'flightOrder', 'basePrice', 'currency',
      'childPricePercent', 'infantPricePercent', 'availableSeats', 'totalSeats',
      'refundable', 'cabinClass', 'hasWifi', 'hasMeal', 'hasEntertainment',
      'hasPowerOutlet', 'checkedBaggage', 'cabinBaggage',
    ];
    for (const f of fields) { if (dto[f] !== undefined) data[f] = dto[f]; }
    if (dto.departureDate !== undefined) data['departureDate'] = new Date(dto.departureDate);
    if (dto.arrivalDate !== undefined) data['arrivalDate'] = dto.arrivalDate ? new Date(dto.arrivalDate) : null;
    return this.prisma.manualFlight.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    await this.getById(id);
    return this.prisma.manualFlight.update({ where: { id }, data: { status: 'inactive' } });
  }

  async getFeatured() {
    return this.prisma.manualFlight.findMany({
      where: { featured: true, status: 'active', departureDate: { gte: new Date() } },
      orderBy: { flightOrder: 'asc' },
    });
  }

  async searchAirports(q: string) {
    return this.prisma.airportReference.findMany({
      where: {
        OR: [
          { iataCode: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { cityName: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { iataCode: 'asc' },
    });
  }

  async searchAirlines(q: string) {
    return this.prisma.airlineReference.findMany({
      where: {
        OR: [
          { iataCode: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { name: 'asc' },
    });
  }
}
