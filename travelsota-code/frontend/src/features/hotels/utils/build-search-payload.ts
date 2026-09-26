import type { FormState } from '@/features/hotels/types/search-form';

function parseCsvNumbers(value: string): number[] {
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((num) => Number.isFinite(num));
}

export function buildHotelSearchPayload(form: FormState, opts?: { page?: number; pageSize?: number; currency?: string }): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    checkIn: form.checkIn,
    checkOut: form.checkOut,
    rooms: form.roomsList.map((room) => {
      const adults = Number(room.adults) || 1;
      const children = Number(room.children) || 0;
      const childAges = room.childAges.trim() ? parseCsvNumbers(room.childAges) : undefined;
      return {
        adults,
        children,
        ...(children > 0 && childAges && childAges.length > 0 ? { childAges } : {}),
      };
    }),
    ...(opts?.page ? { page: opts.page } : {}),
    ...(opts?.pageSize ? { pageSize: opts.pageSize } : {}),
    ...(opts?.currency ? { currency: opts.currency } : {}),
  };

  const hasDestination = !!form.selectedDestinationCode || !!form.destinationName.trim();
  const hasHotelName = !!form.hotelName.trim();
  const cleanDestName = form.destinationName.replace(/\([^)]+\)/g, '').trim();

  // Include nationality when present (used by some suppliers for rate differentiation)
  if (form.nationality?.trim()) {
    payload.nationality = form.nationality.trim().toUpperCase();
  }

  const sp = form.selectedDestination?.searchPayload as Record<string, unknown> | undefined;
  const hasGeo = sp && typeof sp.latitude === 'number' && typeof sp.longitude === 'number';

  if (hasHotelName) {
    payload.hotelName = form.hotelName.trim();
    if (form.selectedDestinationCode && !form.selectedDestinationCode.startsWith('gn-')) {
      payload.destinationCode = form.selectedDestinationCode;
    } else if (cleanDestName) {
      payload.destinationName = cleanDestName;
    }
  } else if (hasDestination) {
    if (form.selectedDestinationCode && !form.selectedDestinationCode.startsWith('gn-')) {
      payload.destinationCode = form.selectedDestinationCode;
    } else if (cleanDestName) {
      payload.destinationName = cleanDestName;
    }
  }

  // Direct hotel search — send exact provider hotel codes from the suggestion.
  // Codes are numeric (Hotelbeds) or alphanumeric (Amadeus) — pass through as-is.
  const hotelSp = form.selectedHotel?.searchPayload as Record<string, unknown> | undefined;
  if (form.selectedHotel && Array.isArray(hotelSp?.hotelCodes) && (hotelSp!.hotelCodes as unknown[]).length > 0) {
    payload.hotelCodes = (hotelSp!.hotelCodes as unknown[]).filter(
      (c) => c !== null && c !== undefined && c !== '',
    );
    if (hotelSp?.canonicalHotelId) {
      payload.canonicalHotelId = hotelSp.canonicalHotelId;
    }
  }

  if (hasGeo) {
    payload.geolocation = {
      latitude: sp!.latitude,
      longitude: sp!.longitude,
      radius: typeof sp!.radiusKm === 'number' ? sp!.radiusKm : 15,
    };
  }

  return payload;
}
