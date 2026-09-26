import { BadGatewayException, BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ProviderConfigService } from '../../../../settings/application/services/provider-config.service';
import { HttpClientService } from '../../../../../shared/http/http-client.service';
import { CacheService } from '../../../../../shared/cache/cache.service';
import { AppConfigService } from '../../../../../shared/config/app-config.service';
import type { HotelSearchDto } from '../../../api/dto/hotel-search.dto';
import type { HotelbedsHotelsConfig } from '../../../../settings/domain/provider-config.entity';
import { normalizeHotelbedsAvailabilityResponse } from './hotelbeds.normalizer';
import { buildHotelSearchCacheKey } from './hotelbeds-search-cache-key';
import { CreateBookingDto } from '../../../api/dto/create-booking.dto';
import { normalizeHotelbedsBookingResponse } from './hotelbeds-booking.normalizer';
import { searchDestinations } from './hotelbeds-destinations';

interface CheckRateRoomRate {
  rateKey: string;
  net: string;
  adults?: number;
  children?: number;
}

interface CheckRateRoom {
  rates: CheckRateRoomRate[];
}

export interface CheckRateResponse {
  currency: string;
  rooms: CheckRateRoom[];
}

@Injectable()
export class HotelbedsService {
  private readonly logger = new Logger(HotelbedsService.name);
  private readonly inFlightSearches = new Map<string, Promise<any>>();

  constructor(
    @Inject(ProviderConfigService) private readonly providerConfigService: ProviderConfigService,
    private readonly httpClient: HttpClientService,
    private readonly cacheService: CacheService,
    private readonly configService: AppConfigService,
  ) { }

  async checkStatus() {
    const config = await this.getConfigOrThrow();
    const endpoint = config.endpoint!.replace(/\/+$/, '');

    const response = await this.httpClient.request(`${endpoint}/hotel-api/1.0/status`, {
      method: 'GET',
      responseType: 'json',
      timeoutMs: config.requestTimeoutMs,
      headers: this.buildHeaders(config.apiKey!, config.secret!),
      ...this.buildMtlsOptions(config),
    });

    return {
      ok: response.ok,
      provider: 'hotelbeds',
      upstreamStatus: response.status,
      upstreamResponse: response.data,
    };
  }

  async searchHotels(input: HotelSearchDto) {

    // Upstream payload supports only hotelCodes/destinationCode/geolocation.
    // For hotelName/destinationName we rely on post-filtering (applyResponseFilters).
    const hasUpstreamCriteria =
      input.hotelCodes?.length || input.geolocation || input.destinationCode;

    if (
      !hasUpstreamCriteria &&
      !input.hotelName?.trim() &&
      !input.destinationName?.trim()
    ) {
      throw new BadRequestException({
        code: 'HOTEL_SEARCH_CRITERIA_REQUIRED',
        message:
          'Provide hotelCodes, destinationCode, geolocation, or hotelName/destinationName.',
      });
    }

    const hasRooms = !!input.rooms?.length;
    const hasOccupancies = !!input.occupancies?.length;
    if (!hasRooms && !hasOccupancies) {
      throw new BadRequestException({
        code: 'HOTEL_ROOMS_REQUIRED',
        message: 'Provide at least one room (either via the "rooms" or "occupancies" field).',
      });
    }

    this.validateOccupancies(input);
    this.validateFilters(input);

    // Dynamically resolve destinationName to destinationCode using suggestDestinations
    if (!input.destinationCode && input.destinationName) {
      const cleanName = input.destinationName.replace(/\([^)]+\)/g, '').trim();
      if (cleanName) {
        const results = await this.suggestDestinations(cleanName).catch(() => []);
        const firstMatch = results?.[0];
        if (firstMatch?.code) {
          input.destinationCode = firstMatch.code;
        }
      }
    }

    // When searching by hotelName or destinationName with no upstream criteria,
    // throw an error — a destination must be provided to narrow the search.
    if (!hasUpstreamCriteria && !input.destinationCode) {
      throw new BadRequestException({
        code: 'HOTEL_DESTINATION_REQUIRED',
        message:
          'Provide a destinationCode or destinationName to search hotels. Hotel name searches require a destination.',
      });
    }

    const cacheKey = buildHotelSearchCacheKey(input);
    const cacheEnabled = this.configService.cache.hotelSearchCacheEnabled;

    // 1. Try cache
    if (cacheEnabled) {
      const cached = await this.cacheService.get<any>(cacheKey);
      if (cached) {
        return this.applyResponseFilters(cached, input);
      }
    }

    // 2. In-flight deduplication
    const inFlight = this.inFlightSearches.get(cacheKey);
    if (inFlight) {
      const deduped = await inFlight;
      return this.applyResponseFilters(deduped, input);
    }

    // 3. Execute upstream
    const config = await this.getConfigOrThrow();
    const endpoint = config.endpoint!.replace(/\/+$/, '');
    const requestPromise = this.executeAvailabilityRequest(input, config, endpoint);

    this.inFlightSearches.set(cacheKey, requestPromise);

    try {
      const normalized = await requestPromise;

      if (cacheEnabled) {
        void this.cacheService
          .set(cacheKey, normalized, this.configService.cache.hotelSearchCacheTtlSeconds)
          .catch(() => undefined);
      }

      return this.applyResponseFilters(normalized, input);
    } finally {
      this.inFlightSearches.delete(cacheKey);
    }
  }

  private async executeAvailabilityRequest(
    input: HotelSearchDto,
    config: any,
    endpoint: string,
  ) {
    const payload = this.buildAvailabilityPayload(input);
    if (process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true') {
      this.logger.debug(`[HOTELBEDS] SERP payload: ${JSON.stringify(payload)}`);
    }

    const response = await this.httpClient.request<any>(`${endpoint}/hotel-api/1.0/hotels`, {
      method: 'POST',
      responseType: 'json',
      timeoutMs: config.requestTimeoutMs,
      headers: {
        ...this.buildHeaders(config.apiKey!, config.secret!),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      ...this.buildMtlsOptions(config),
    });

    if (!response.ok) {
      throw new BadGatewayException({
        code: 'HOTELBEDS_SEARCH_FAILED',
        message: 'Hotelbeds availability request failed.',
        details: {
          upstreamStatus: response.status,
          upstreamResponse: response.data,
        },
      });
    }

    const expectedRooms = input.rooms
      ? input.rooms.length
      : (input.occupancies ?? []).reduce((sum, occ) => sum + occ.rooms, 0);

    return normalizeHotelbedsAvailabilityResponse(response.data, expectedRooms);
  }

  async checkRate(rateKey: string): Promise<CheckRateResponse> {
    const config = await this.getConfigOrThrow();
    const endpoint = config.endpoint!.replace(/\/+$/, '');

    // Decode in case the rateKey arrives URL-encoded (e.g. | → %7C)
    const decodedRateKey = decodeURIComponent(rateKey);

    // Support combined rateKey with multiple keys joined by |||
    const rateKeys = decodedRateKey.split('|||').filter(Boolean);

    const response = await this.httpClient.request(
      `${endpoint}/hotel-api/1.0/checkrates`,
      {
        method: 'POST',
        responseType: 'json',
        timeoutMs: config.requestTimeoutMs,
        headers: {
          ...this.buildHeaders(
            config.apiKey!,
            config.secret!,
          ),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rooms: rateKeys.map((rk) => ({ rateKey: rk })),
        }),
        ...this.buildMtlsOptions(config),
      },
    );

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'Hotelbeds checkRate request failed.',
        code: 'HOTELBEDS_CHECK_RATE_FAILED',
        details: {
          upstreamStatus: response.status,
          upstreamResponse: response.data,
        },
      });
    }

    const data = response.data as any;
    const hotel = data?.hotel;

    if (
      !hotel ||
      !Array.isArray(hotel.rooms) ||
      hotel.rooms.length === 0 ||
      !hotel.rooms.some((r: any) => r?.rates?.length)
    ) {
      throw new BadGatewayException({
        message: `Hotelbeds checkRate returned an unexpected response shape. Body: ${(response.rawBody ?? 'empty').substring(0, 2000)}`,
        code: 'HOTELBEDS_CHECK_RATE_INVALID_RESPONSE',
      });
    }

    return {
      currency: hotel.currency,
      rooms: hotel.rooms,
    } as CheckRateResponse;
  }

  async bookHotel(input: CreateBookingDto & { tolerance?: number }) {
    const config = await this.getConfigOrThrow();

    const endpoint = config.endpoint!.replace(/\/+$/, '');

    // Decode in case the rateKey arrives URL-encoded
    const decodedRateKey = decodeURIComponent(input.rateKey ?? '');

    // Support combined rateKey (multiple keys joined by |||)
    const rateKeys = decodedRateKey.split('|||').filter(Boolean);

    // Use the per-room occupancy from the checkRate response (NOT from parsing the rateKey)
    const paxPerRoom = (input.roomAdults ?? 1) + (input.roomChildren ?? 0);
    const paxes = input.paxes as any[];

    // Validate: total pax count must match the occupancy
    if (paxes.length % paxPerRoom !== 0) {
      throw new BadRequestException({
        code: 'PAX_OCCUPANCY_MISMATCH',
        message: `Total pax count (${paxes.length}) is not divisible by the per-room capacity (${paxPerRoom} pax per room). Please ensure the number of guests matches the selected rate occupancy.`,
      });
    }

    // Distribute paxes into room entries. Each entry gets its own rateKey from the combined key.
    const rooms: { rateKey: string; paxes: { roomId: number; type: string; name: string; surname: string }[] }[] = [];

    for (let i = 0; i < paxes.length; i += paxPerRoom) {
      const roomIndex = Math.floor(i / paxPerRoom);
      const rateKey = rateKeys[Math.min(roomIndex, rateKeys.length - 1)];

      const roomPaxes = paxes.slice(i, i + paxPerRoom).map((pax: any) => ({
        roomId: roomIndex + 1,  // 1-indexed per room
        type: pax.type === 'ADULT' ? 'AD' : pax.type === 'CHILD' ? 'CH' : pax.type,
        name: pax.name,
        surname: pax.surname,
      }));
      rooms.push({ rateKey, paxes: roomPaxes });
    }

    this.logger.debug(`[BOOKHOTEL] rooms: ${rooms.length}, rateKeys: ${rateKeys.length}, paxPerRoom: ${paxPerRoom}`);

    // Sanitize clientReference: Hotelbeds only allows [A-Za-z0-9_-], max 20 chars
    const rawRef = input.clientReference ?? `hb_${Date.now()}`;
    const clientRef = rawRef.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 20);

    const requestBody: Record<string, unknown> = {
      holder: input.holder,
      rooms,
      clientReference: clientRef,
      paymentType: 'AT_WEB',
    };

    if (input.tolerance !== undefined) {
      requestBody.tolerance = input.tolerance;
    }

    const response = await this.httpClient.request(
      `${endpoint}/hotel-api/1.0/bookings`,
      {
        method: 'POST',
        responseType: 'json',
        headers: {
          ...this.buildHeaders(
            config.apiKey!,
            config.secret!,
          ),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        ...this.buildMtlsOptions(config),
      },
    );

    if (!response.ok) {
      this.logger.error(
        `[HOTELBEDS] Booking API error: status=${response.status} endpoint=${endpoint}/hotel-api/1.0/bookings`,
        JSON.stringify({
          requestBody,
          upstreamStatus: response.status,
          upstreamResponse: response.data,
          rawBody: response.rawBody?.substring(0, 3000),
        }, null, 2),
      );
      throw new BadGatewayException({
        code: 'HOTELBEDS_BOOKING_FAILED',
        message: 'Hotelbeds booking request failed.',
        details: {
          upstreamStatus: response.status,
          upstreamResponse: response.data,
          rawBody: response.rawBody?.substring(0, 3000),
        },
      });
    }

    const normalized =
      normalizeHotelbedsBookingResponse(
        response.data,
      );

    return normalized;
  }

  async cancelBooking(reference: string, reason?: string) {
    const config = await this.getConfigOrThrow();
    const endpoint = config.endpoint!.replace(/\/+$/, '');

    const url = new URL(`${endpoint}/hotel-api/1.0/bookings/${encodeURIComponent(reference)}`);
    url.searchParams.set('cancellationFlag', 'CANCELLATION');

    this.logger.log(`[HOTELBEDS] Cancelling booking: ${reference} url=${url.toString()}`);

    const response = await this.httpClient.request<any>(url.toString(), {
      method: 'DELETE',
      responseType: 'json',
      timeoutMs: config.requestTimeoutMs,
      headers: this.buildHeaders(config.apiKey!, config.secret!),
      ...this.buildMtlsOptions(config),
    });

    if (!response.ok) {
      this.logger.error(
        `[HOTELBEDS] Cancellation failed: reference=${reference} status=${response.status}`,
      );
      throw new BadGatewayException({
        code: 'HOTELBEDS_CANCELLATION_FAILED',
        message: 'Hotelbeds cancellation request failed.',
        details: {
          upstreamStatus: response.status,
          upstreamResponse: response.data,
        },
      });
    }

    const data = response.data as any;
    const booking = data?.booking;
    this.logger.log(
      `[HOTELBEDS] Cancellation successful: reference=${booking?.reference ?? reference} status=${booking?.status ?? 'CANCELLED'}`,
    );

    return data;
  }

  async changeBooking(
    reference: string,
    mode: 'SIMULATION' | 'BOOKING',
    changes?: { checkIn?: string; checkOut?: string; holder?: { name?: string; surname?: string } },
    baseBooking?: unknown,
  ) {
    const config = await this.getConfigOrThrow();
    const endpoint = config.endpoint!.replace(/\/+$/, '');
    const baseUrl = `${endpoint}/hotel-api/1.0/bookings/${encodeURIComponent(reference)}`;

    // 1. Retrieve the current booking so the change request carries the full
    //    booking object (Hotelbeds requires the complete payload, not a diff).
    //    For a BOOKING commit the caller passes the re-priced payload that the
    //    preceding SIMULATION returned — skipping the stale original.
    let bookingPayload: Record<string, unknown>;
    if (baseBooking) {
      bookingPayload = JSON.parse(JSON.stringify(baseBooking));
    } else {
      const current = await this.httpClient.request<any>(baseUrl, {
        method: 'GET',
        responseType: 'json',
        timeoutMs: config.requestTimeoutMs,
        headers: this.buildHeaders(config.apiKey!, config.secret!),
        ...this.buildMtlsOptions(config),
      });

      if (!current.ok || !current.data?.booking) {
        throw new BadGatewayException({
          code: 'HOTELBEDS_BOOKING_LOOKUP_FAILED',
          message: 'Unable to retrieve booking for change.',
          details: { upstreamStatus: current.status, upstreamResponse: current.data },
        });
      }
      bookingPayload = JSON.parse(JSON.stringify(current.data.booking));
    }

    // 2. Merge requested changes into the booking payload.
    if (changes?.checkIn && bookingPayload.hotel) {
      (bookingPayload.hotel as Record<string, unknown>).checkIn = changes.checkIn;
    }
    if (changes?.checkOut && bookingPayload.hotel) {
      (bookingPayload.hotel as Record<string, unknown>).checkOut = changes.checkOut;
    }
    if (changes?.holder) {
      bookingPayload.holder = {
        ...((bookingPayload.holder ?? {}) as Record<string, unknown>),
        name: changes.holder.name ?? (bookingPayload.holder as any)?.name,
        surname: changes.holder.surname ?? (bookingPayload.holder as any)?.surname,
      };
    }

    // 3. Send the change.
    const response = await this.httpClient.request<any>(baseUrl, {
      method: 'PUT',
      responseType: 'json',
      timeoutMs: config.requestTimeoutMs,
      headers: {
        ...this.buildHeaders(config.apiKey!, config.secret!),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode, booking: bookingPayload }),
      ...this.buildMtlsOptions(config),
    });

    if (!response.ok) {
      const upstream = (response.data as any)?.error
        ?? (response.data as any)?.errorMessage
        ?? response.data;
      this.logger.error(
        `[HOTELBEDS] Change failed: reference=${reference} mode=${mode} status=${response.status} details=${JSON.stringify(upstream ?? {})}`,
      );
      throw new BadGatewayException({
        code: 'HOTELBEDS_CHANGE_FAILED',
        message: 'Hotelbeds booking change request failed.',
        details: {
          upstreamStatus: response.status,
          upstreamResponse: response.data,
          upstreamError: upstream,
        },
      });
    }

    const data = response.data as any;
    const booking = data?.booking;
    this.logger.log(
      `[HOTELBEDS] Change successful: reference=${booking?.reference ?? reference} mode=${mode} status=${booking?.status ?? 'CONFIRMED'}`,
    );

    return normalizeHotelbedsBookingResponse(data);
  }

  async getBooking(reference: string) {
    const config = await this.getConfigOrThrow();

    const endpoint = config.endpoint!.replace(/\/+$/, '');

    const response = await this.httpClient.request(
      `${endpoint}/hotel-api/1.0/bookings/${reference}`,
      {
        method: 'GET',
        responseType: 'json',
        headers: this.buildHeaders(
          config.apiKey!,
          config.secret!,
        ),
        ...this.buildMtlsOptions(config),
      },
    );

    if (!response.ok) {
      throw new BadGatewayException({
        code: 'HOTELBEDS_BOOKING_LOOKUP_FAILED',
        message: 'Unable to retrieve booking.',
        details: {
          upstreamStatus: response.status,
          upstreamResponse: response.data,
        },
      });
    }

    return normalizeHotelbedsBookingResponse(
      response.data,
    );
  }

  async suggestDestinations(query: string) {
    return searchDestinations(query);
  }

  async suggestHotels(destinationCode: string, query: string = '') {
    if (!destinationCode?.trim()) return [];
    const config = await this.getConfigOrThrow();
    const endpoint = config.endpoint!.replace(/\/+$/, '');
    const q = query.toLowerCase().trim();
    const dc = destinationCode.toUpperCase().trim();

    const url = `${endpoint}/hotel-content-api/1.0/hotels?fields=code,name,city,destinationCode,category,countryCode&language=ENG&destinationCodes=${dc}&offset=0&limit=50`;

    const response = await this.httpClient.request<any>(url, {
      method: 'GET',
      responseType: 'json',
      timeoutMs: config.requestTimeoutMs,
      headers: {
        ...this.buildHeaders(config.apiKey!, config.secret!),
        Accept: 'application/json',
      },
      ...this.buildMtlsOptions(config),
    });

    if (!response.ok || !response.data) {
      return [];
    }

    const raw = response.data as any;
    const hotels = Array.isArray(raw) ? raw : (Array.isArray(raw?.hotels) ? raw.hotels : []);
    return hotels
      .filter((h: any) => {
        if (!h?.name) return false;
        if (!q) return true;
        return String(h.name).toLowerCase().includes(q);
      })
      .slice(0, 10)
      .map((h: any) => ({
        code: String(h.code ?? ''),
        name: String(h.name ?? ''),
        destinationCode: String(h.destinationCode ?? ''),
        city: String(h.city ?? ''),
        category: String(h.category ?? ''),
      }));
  }

  private async getConfigOrThrow() {
    const runtimeConfig = await this.providerConfigService.getHotelsProviderRuntime('hotelbeds');
    const config = runtimeConfig.config as HotelbedsHotelsConfig;

    const missing = [
      ['endpoint', config.endpoint],
      ['apiKey', config.apiKey],
      ['secret', config.secret],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'HOTELBEDS_MISCONFIGURED',
        message: 'Hotelbeds credentials are not configured in admin panel.',
        details: { missing },
      });
    }

    return config;
  }

  private buildMtlsOptions(config: any) {
    if (config.environment === 'mtls' && config.sslCert && config.sslKey) {
      return { sslCert: config.sslCert, sslKey: config.sslKey };
    }
    return {};
  }

  private buildHeaders(apiKey: string, secret: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHash('sha256')
      .update(`${apiKey}${secret}${timestamp}`)
      .digest('hex');

    return {
      'Api-key': apiKey,
      'X-Signature': signature,
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
    };
  }

  private buildAvailabilityPayload(input: HotelSearchDto) {
    const filter = this.buildAvailabilityFilters(input);

    // Convert the new per-room format (input.rooms) to the Hotelbeds occupancies wire format.
    // When rooms are provided, each room becomes a separate occupancy with rooms: 1.
    // When the legacy occupancies field is used, pass it through as-is.
    const occupancies = input.rooms
      ? input.rooms.map((room) => ({
          rooms: 1,
          adults: room.adults,
          children: room.children,
          ...(room.childAges?.length
            ? {
                paxes: room.childAges.map((age) => ({
                  type: 'CH' as const,
                  age,
                })),
              }
            : {}),
        }))
      : (input.occupancies ?? []).map((occupancy) => ({
          rooms: occupancy.rooms,
          adults: occupancy.adults,
          children: occupancy.children,
          ...(occupancy.childAges?.length
            ? {
                paxes: occupancy.childAges.map((age) => ({
                  type: 'CH' as const,
                  age,
                })),
              }
            : {}),
        }));

    return {
      stay: {
        checkIn: input.checkIn,
        checkOut: input.checkOut,
      },
      occupancies,
      ...(input.hotelCodes?.length
        ? { hotels: { hotel: input.hotelCodes } }
        : {}),
      // Hotelbeds API: geolocation, destination, and hotels are mutually exclusive.
      // Prefer geolocation when available (more specific), otherwise use destination.
      ...(input.geolocation
        ? {
          geolocation: {
            latitude: input.geolocation.latitude,
            longitude: input.geolocation.longitude,
            radius: input.geolocation.radius,
            unit: 'km',
          },
        }
        : input.destinationCode
          ? { destination: { code: input.destinationCode.trim().toUpperCase() } }
          : {}),
      ...(filter ? { filter } : {}),
    };
  }

  private buildAvailabilityFilters(input: HotelSearchDto) {
    const filter: Record<string, unknown> = {};

    if (input.minRate !== undefined) {
      filter.minRate = input.minRate;
    }

    if (input.maxRate !== undefined) {
      filter.maxRate = input.maxRate;
    }

    if (input.minCategory !== undefined) {
      filter.minCategory = input.minCategory;
    }

    if (input.maxCategory !== undefined) {
      filter.maxCategory = input.maxCategory;
    }

    if (input.paymentType && input.paymentType !== 'any') {
      filter.paymentType = input.paymentType;
    }

    if (input.maxRatesPerRoom !== undefined) {
      filter.maxRatesPerRoom = input.maxRatesPerRoom;
    }

    if (input.packaging !== undefined) {
      filter.packaging = input.packaging ? 'TRUE' : 'FALSE';
    }

    if (input.hotelPackage) {
      filter.hotelPackage = input.hotelPackage;
    }

    return Object.keys(filter).length > 0 ? filter : undefined;
  }

  private validateOccupancies(input: HotelSearchDto) {
    const entries = input.rooms ?? input.occupancies ?? [];
    entries.forEach((entry: any, index: number) => {
      if (entry.children > 0) {
        const ages = entry.childAges ?? [];
        if (ages.length !== entry.children) {
          throw new BadRequestException({
            code: 'HOTEL_CHILD_AGES_REQUIRED',
            message:
              'childAges must be provided for each child in the room/occupancy.',
            details: {
              index,
              expected: entry.children,
              received: ages.length,
            },
          });
        }
      } else if (entry.childAges?.length) {
        throw new BadRequestException({
          code: 'HOTEL_CHILD_AGES_NOT_ALLOWED',
          message: 'childAges must be omitted when children is 0.',
          details: {
            index,
          },
        });
      }
    });
  }

  private validateFilters(input: HotelSearchDto) {
    if (
      input.minRate !== undefined &&
      input.maxRate !== undefined &&
      input.minRate > input.maxRate
    ) {
      throw new BadRequestException({
        code: 'HOTEL_RATE_RANGE_INVALID',
        message: 'minRate must be less than or equal to maxRate.',
      });
    }

    if (
      input.minCategory !== undefined &&
      input.maxCategory !== undefined &&
      input.minCategory > input.maxCategory
    ) {
      throw new BadRequestException({
        code: 'HOTEL_CATEGORY_RANGE_INVALID',
        message: 'minCategory must be less than or equal to maxCategory.',
      });
    }
  }

  private applyResponseFilters(
    result: ReturnType<typeof normalizeHotelbedsAvailabilityResponse>,
    input: HotelSearchDto,
  ) {
    const hotelName = input.hotelName?.trim().toLowerCase();
    // Clean destinationName: strip parenthetical codes like "Barcelona (BCN)" -> "Barcelona"
    const destinationName = input.destinationName
      ? input.destinationName.replace(/\([^)]+\)/g, '').trim().toLowerCase()
      : undefined;

    // Skip destinationName filtering when geolocation is present — the geo search
    // already scoped results spatially, and destinationName (e.g. "Dubai Marina")
    // rarely matches the hotel's destinationName field exactly (e.g. "Dubai").
    if (input.geolocation && destinationName && !hotelName) {
      return result;
    }

    // If no hotel name or destination name to filter by, skip post-filtering entirely
    if (!hotelName && !destinationName) {
      return result;
    }

    const hotels = result.hotels.filter((hotel) => {
      const matchesHotelName = hotelName
        ? hotel.name.toLowerCase().includes(hotelName)
        : true;
      const matchesDestinationName = destinationName
        ? hotel.destinationName?.toLowerCase().includes(destinationName)
        : true;
      return matchesHotelName && matchesDestinationName;
    });

    return {
      ...result,
      hotels,
      meta: {
        ...result.meta,
        total: hotels.length,
      },
    };
  }
}
