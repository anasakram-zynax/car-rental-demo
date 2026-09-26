import type {
  NormalizedHotelOffer,
  NormalizedHotelRate,
  NormalizedHotelSearchResponse,
} from '../../../domain/entities/hotel-search-response';

/**
 * Extract the rate code from a rateKey string.
 * rateKey format: checkIn|checkOut|...|hotelCode|roomCode|rateCode|boardCode||...
 * The rate code is at index 6.
 * Hotelbeds says not to "parse or work with" the rateKey, but extracting the
 * rateCode for grouping purposes is the only reliable discriminator since the
 * API response JSON does not include a separate rateCode field.
 */

// ponytail: global counter for lossy-merge warnings to avoid spamming logs
let _lossyMergeWarningIssued = false;
function warnLossyMerge(
  hotelCode: string,
  groups: number,
  roomsCount: number,
): void {
  if (_lossyMergeWarningIssued) return;
  _lossyMergeWarningIssued = true;
  console.warn(
    `[HOTELBEDS] Partial multi-room merge: hotel ${hotelCode}: ${groups} group(s) had fewer than ${roomsCount} room entries. ` +
      `These rates are included with partialMerge=true — the frontend should warn the user.`,
  );
}
function getRateCode(rateKey: string): string {
  return rateKey.split('|')[6] ?? '';
}

function extractCancellationPolicies(rate: any) {
  const raw = rate?.cancellationPolicies;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((p: any) => ({
    amount: p.amount,
    from: p.from,
    deadline: p.deadline,
    policyType: p.policyType,
    percentage: p.percentage,
    numberOfNights: p.numberOfNights,
  }));
}

function formatCancellationText(
  policies: any[] | undefined,
): string | undefined {
  if (!policies?.length) return undefined;
  const first = policies[0];
  const parts: string[] = [];
  if (first.amount)
    parts.push(`${first.policyType ?? 'Cancellation'}: ${first.amount}`);
  if (first.from) parts.push(`from ${first.from}`);
  if (first.deadline) parts.push(`by ${first.deadline}`);
  return parts.join(' ') || undefined;
}

/**
 * A rate is refundable (free cancellation) when all cancellation policies
 * have zero amount, percentage, and numberOfNights.
 */
function isRefundable(policies: any[] | undefined): boolean {
  if (!policies?.length) return false;
  return policies.every((p) => {
    const amount = Number(p.amount ?? 0);
    const percentage = Number(p.percentage ?? 0);
    const nights = Number(p.numberOfNights ?? 0);
    return amount === 0 && percentage === 0 && nights === 0;
  });
}

export function normalizeHotelbedsAvailabilityResponse(
  raw: any,
  expectedRooms: number = 1,
): NormalizedHotelSearchResponse {
  const hotels = Array.isArray(raw?.hotels?.hotels) ? raw.hotels.hotels : [];

  const normalizedHotels = hotels
    .map((hotel: any) => normalizeHotel(hotel, expectedRooms))
    .filter((h: NormalizedHotelOffer | null) => h !== null);

  return {
    provider: 'hotelbeds',
    hotels: normalizedHotels,
    meta: {
      total: normalizedHotels.length,
      checkIn: raw?.hotels?.checkIn,
      checkOut: raw?.hotels?.checkOut,
    },
  };
}

function normalizeHotel(
  hotel: any,
  expectedRooms: number,
): NormalizedHotelOffer | null {
  const rooms = Array.isArray(hotel?.rooms) ? hotel.rooms : [];
  const roomsCount = rooms.length;

  const allRates = rooms.flatMap((room: any) =>
    Array.isArray(room?.rates)
      ? room.rates.map((rate: any) => ({ room, rate }))
      : [],
  );

  let normalizedRates: NormalizedHotelRate[];

  if (expectedRooms > 1 && roomsCount < expectedRooms) {
    // API returned fewer room entries than the user needs.
    // Check if any individual rate has a `rooms` field >= expectedRooms
    // (Hotelbeds may collapse same-occupancy rooms into one entry).
    const rateRooms = allRates.map((e) => Number(e.rate?.rooms ?? 0));
    const maxRateRooms = Math.max(0, ...rateRooms);
    if (maxRateRooms < expectedRooms) {
      normalizedRates = [];
    } else {
      // Build combined rates from the single room entry,
      // multiplying net by the number-of-rooms the rate covers.
      const combined: NormalizedHotelRate[] = [];
      for (const item of allRates) {
        const r = item.rate;
        const rooms = Number(r?.rooms ?? 0);
        const policies = extractCancellationPolicies(r);
        combined.push({
          rateKey: r?.rateKey,
          roomName: item.room?.name || item.room?.code || 'Standard Room',
          boardName: r?.boardName,
          paymentType: r?.paymentType,
          net: Number(r?.net ?? 0) * rooms,
          currency: hotel?.currency,
          cancellationPolicyText: formatCancellationText(policies),
          cancellationPolicies: policies,
          refundable: isRefundable(policies),
          roomCode: item.room?.code || undefined,
          roomKey: item.room?.code ? `hb:room:${item.room.code}` : undefined,
          adults: r?.adults != null ? Number(r.adults) : undefined,
          children: r?.children != null ? Number(r.children) : undefined,
        });
      }
      normalizedRates = combined;
    }
  } else if (roomsCount > 1) {
    // Multi-room search: combine matching rates across all rooms into one price.
    // Match rooms that share the same (roomCode, rateCode, boardCode).
    // Groups with incomplete room coverage are included with partialMerge: true
    // instead of being dropped, so the frontend can show a warning.
    const groups = new Map<string, { room: any; rate: any }[]>();

    for (const item of allRates) {
      const rc = getRateCode(item.rate?.rateKey ?? '');
      const key = `${item.room?.code}|${rc}|${item.rate?.boardCode}|${item.rate?.adults ?? 0}|${item.rate?.children ?? 0}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    const combined: NormalizedHotelRate[] = [];
    let lossyCount = 0;

    for (const [, entries] of groups) {
      const isPartial = entries.length !== roomsCount;
      if (isPartial) lossyCount++;

      const firstRate = entries[0].rate;
      const totalNet = entries.reduce(
        (sum, e) => sum + Number(e.rate?.net ?? 0),
        0,
      );
      const allKeys = entries
        .map((e) => e.rate?.rateKey)
        .filter(Boolean)
        .join('|||');

      const roomCodes = entries
        .map((e) => e.room?.code)
        .filter(Boolean)
        .join(',');
      const policies = extractCancellationPolicies(firstRate);
      combined.push({
        rateKey: allKeys,
        roomName:
          entries[0].room?.name || entries[0].room?.code || 'Standard Room',
        boardName: firstRate?.boardName,
        paymentType: firstRate?.paymentType,
        net: totalNet,
        currency: hotel?.currency,
        cancellationPolicyText: formatCancellationText(policies),
        cancellationPolicies: policies,
        refundable: isRefundable(policies),
        roomCode: roomCodes || undefined,
        roomKey: roomCodes ? `hb:combined:${roomCodes}` : undefined,
        partialMerge: isPartial || undefined,
        adults:
          firstRate?.adults != null ? Number(firstRate.adults) : undefined,
        children:
          firstRate?.children != null ? Number(firstRate.children) : undefined,
      });
    }

    if (lossyCount > 0) {
      warnLossyMerge(hotel?.code ?? 'unknown', lossyCount, roomsCount);
    }

    normalizedRates = combined.length > 0 ? combined : [];
  } else {
    normalizedRates = buildIndividualRates(allRates, hotel?.currency);
  }

  if (normalizedRates.length === 0) {
    return null;
  }

  const sorted = [...normalizedRates]
    .filter((r) => Number.isFinite(r.net))
    .sort((a, b) => (a.net ?? 0) - (b.net ?? 0));

  const cheapest = sorted[0];

  return {
    hotelId: String(hotel?.code ?? ''),
    name: hotel?.name ?? 'Unknown hotel',
    destinationCode: hotel?.destinationCode,
    destinationName: hotel?.destinationName,
    zoneName: hotel?.zoneName,
    categoryName: hotel?.categoryName,
    latitude: hotel?.latitude,
    longitude: hotel?.longitude,

    rates: normalizedRates,
    roomsCount,
    minRate: cheapest
      ? {
          currency: hotel?.currency,
          total: cheapest.net!,
          rateKey: cheapest.rateKey,
          boardName: cheapest.boardName,
          paymentType: cheapest.paymentType,
          cancellationPolicyText: cheapest.cancellationPolicyText,
          cancellationPolicies: cheapest.cancellationPolicies,
          refundable: cheapest.refundable,
        }
      : undefined,
  };
}

function buildIndividualRates(
  allRates: { room: any; rate: any }[],
  currency?: string,
): NormalizedHotelRate[] {
  return allRates.map(({ room, rate }) => {
    const policies = extractCancellationPolicies(rate);
    return {
      rateKey: rate?.rateKey,
      roomName: room?.name || room?.code || 'Standard Room',
      boardName: rate?.boardName,
      paymentType: rate?.paymentType,
      net: Number(rate?.net),
      currency,
      cancellationPolicyText: formatCancellationText(policies),
      cancellationPolicies: policies,
      refundable: isRefundable(policies),
      roomCode: room?.code || undefined,
      roomKey: room?.code ? `hb:room:${room.code}` : undefined,
    };
  });
}
