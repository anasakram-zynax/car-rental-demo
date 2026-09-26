import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { FlightProvider } from '../application/ports/flight-provider.interface';
import type { FlightSearchDto } from '../api/dto/flight-search.dto';
import type { NormalizedFlightSearchResponse, NormalizedFlightOffer, NormalizedFlightSegment } from '../domain/entities/flight-search-response';

@Injectable()
export class ManualFlightProvider implements FlightProvider {
  readonly key = 'manual' as const;
  private readonly logger = new Logger(ManualFlightProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  async searchFlights(input: FlightSearchDto): Promise<NormalizedFlightSearchResponse> {
    const where: any = {
      status: 'active',
      departureDate: input.departureDate ? { gte: new Date(input.departureDate) } : { gte: new Date() },
      availableSeats: { gt: 0 },
    };

    if (input.from) where.originId = input.from.toUpperCase();
    if (input.to) where.destinationId = input.to.toUpperCase();

    const flights = await this.prisma.manualFlight.findMany({
      where,
      orderBy: { basePrice: 'asc' },
      take: 200,
    });

    const offers: NormalizedFlightOffer[] = flights.map((f) => ({
      id: f.id,
      provider: 'manual',
      price: { currency: f.currency, base: f.basePrice, taxes: 0, total: f.basePrice },
      stops: 0,
      cabin: f.cabinClass,
      totalDuration: f.duration ?? undefined,
      segments: [{
        id: `${f.id}-seg`,
        carrier: f.airlineId ?? undefined,
        flightNumber: f.flightNumber ?? undefined,
        operatingCarrier: f.airlineId ?? undefined,
        duration: f.duration ?? undefined,
        departure: {
          airport: f.originId,
          date: f.departureDate.toISOString().split('T')[0],
          time: f.departureTime,
        },
        arrival: {
          airport: f.destinationId,
          date: (f.arrivalDate ?? f.departureDate).toISOString().split('T')[0],
          time: f.arrivalTime,
        },
        display: {
          origin: { code: f.originId, cityName: f.originCity ?? undefined, label: f.originCity ?? f.originId },
          destination: { code: f.destinationId, cityName: f.destinationCity ?? undefined, label: f.destinationCity ?? f.destinationId },
          airlineCode: f.airlineId ?? undefined,
          airlineName: f.airlineName ?? undefined,
          flightNumber: f.flightNumber ?? undefined,
        },
      } satisfies NormalizedFlightSegment],
      baggage: {
        checked: f.checkedBaggage ? { text: f.checkedBaggage } : undefined,
        carryOn: f.cabinBaggage ? { text: f.cabinBaggage } : undefined,
      },
      metadata: { productRef: f.id },
    } satisfies NormalizedFlightOffer));

    return { provider: 'manual', offers } as NormalizedFlightSearchResponse;
  }
}
