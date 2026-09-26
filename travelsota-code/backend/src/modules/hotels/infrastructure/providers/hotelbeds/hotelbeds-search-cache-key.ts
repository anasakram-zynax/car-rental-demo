import { createHash } from 'node:crypto';
import type { HotelSearchDto } from '../../../api/dto/hotel-search.dto';

export function buildHotelSearchCacheKey(input: HotelSearchDto): string {
  const payload = {
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    hotelCodes: input.hotelCodes?.slice()?.sort(),
    destinationCode: input.destinationCode,
    geolocation: input.geolocation,
    rooms:
      input.rooms?.map((r) => ({
        adults: r.adults,
        children: r.children,
        childAges: r.childAges?.slice()?.sort(),
      })) ?? null,
    occupancies:
      input.occupancies?.map((o) => ({
        rooms: o.rooms,
        adults: o.adults,
        children: o.children,
        childAges: o.childAges?.slice()?.sort(),
      })) ?? null,
    minRate: input.minRate,
    maxRate: input.maxRate,
    minCategory: input.minCategory,
    maxCategory: input.maxCategory,
    paymentType: input.paymentType,
    maxRatesPerRoom: input.maxRatesPerRoom,
    packaging: input.packaging,
    hotelPackage: input.hotelPackage,
  };

  const json = JSON.stringify(payload);
  return `hotel:search:${createHash('sha256').update(json).digest('hex')}`;
}

export function buildHotelSearchPostFilterKey(input: HotelSearchDto, baseKey: string): string {
  const filterPayload = {
    hotelName: input.hotelName?.trim().toLowerCase() ?? null,
    destinationName: input.destinationName?.trim().toLowerCase() ?? null,
  };
  return `${baseKey}:${createHash('sha256').update(JSON.stringify(filterPayload)).digest('hex')}`;
}
