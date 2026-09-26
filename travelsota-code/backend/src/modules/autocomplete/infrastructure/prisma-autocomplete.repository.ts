import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { AutocompleteRepoPort } from '../application/ports/autocomplete-repo.port';
import type { AutocompleteSuggestion } from '../domain/autocomplete.types';
// Hotelbeds hardcoded destination list and live hotel-content suggestions
// were removed with the supplier integrations in this starter kit — the
// DB-backed destinations/hotels search below (manual catalog) is now the
// only source.

// Ponytail: simple TTL cache for autocomplete results (key → {data, expiry})
const CACHE_TTL_MS = 60_000; // 1 minute
const MAX_CACHE_SIZE = 200;
const autocompleteCache = new Map<string, { data: AutocompleteSuggestion[]; expiry: number }>();

function cacheGet(key: string): AutocompleteSuggestion[] | null {
  const entry = autocompleteCache.get(key);
  if (!entry || Date.now() > entry.expiry) {
    if (entry) autocompleteCache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key: string, data: AutocompleteSuggestion[]): void {
  if (autocompleteCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const first = autocompleteCache.keys().next().value;
    if (first) autocompleteCache.delete(first);
  }
  autocompleteCache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}

@Injectable()
export class PrismaAutocompleteRepository implements AutocompleteRepoPort {
  private readonly logger = new Logger(PrismaAutocompleteRepository.name);
  private warmedUp = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Warm up SQLite page cache + Prisma query cache on first request.
   * Runs one lightweight query to force OS to load the DB pages.
   */
  async warmUp(): Promise<void> {
    if (this.warmedUp) return;
    try {
      const start = Date.now();
      await this.prisma.destinations.findMany({
        where: { enabled: true, contentStatus: { in: ['partial', 'ready'] } },
        orderBy: { displayOrder: 'asc' },
        take: 10,
        select: { id: true, code: true, name: true },
      });
      await this.prisma.flightLocation.findMany({
        where: { enabled: true },
        orderBy: { popularityScore: 'desc' },
        take: 10,
        select: { id: true, code: true, name: true },
      });
      this.warmedUp = true;
      this.logger.log(`[AUTOCOMPLETE] Warm-up done in ${Date.now() - start}ms`);
    } catch (e) {
      this.logger.warn(`[AUTOCOMPLETE] Warm-up failed: ${e}`);
    }
  }

  async searchSupplierDestinationss(
    query: string,
    limit: number,
  ): Promise<AutocompleteSuggestion[]> {
    const normalized = query.toLowerCase().trim();
    const cacheKey = `dest:${normalized}:${limit}`;

    // Check cache first
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    // Warm up on first request (cold start fix)
    await this.warmUp();

    // 1. Search DB-backed Destinations
    const dbRows = await this.searchDbDestinations(normalized, limit);

    // Ponytail: country expansion — if the query matched a country-level
    // destination (e.g. "nigeria" → NG), also surface that country's top
    // cities so selecting the country (or just typing it) shows real places.
    const matchedCountry = dbRows.find(
      (r) => r.searchPayload?.countryLevel === true,
    );
    let expandedRows = dbRows;
    if (matchedCountry) {
      const countryCode = matchedCountry.code;
      const cities = await this.prisma.destinations.findMany({
        where: {
          countryCode,
          code: { not: countryCode }, // exclude the country row itself
          enabled: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        take: limit,
      });
      const cityCodes = new Set(expandedRows.map((r) => r.destinationCode));
      const cityRows = cities
        .filter((c) => !cityCodes.has(c.code))
        .map((c) => this.mapDestination(c));
      expandedRows = [...dbRows, ...cityRows].slice(0, limit * 2);
    }

    const result = expandedRows.slice(0, limit);
    cacheSet(cacheKey, result);
    return result;
  }

  async searchHotels(
    query: string,
    destinationCode?: string,
    limit: number = 10,
  ): Promise<AutocompleteSuggestion[]> {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return [];

    // 1. Try DB-backed Hotels search
    const dbResults = await this.searchDbHotels(
      normalized,
      destinationCode,
      limit,
    );

    return dbResults;
  }

  async searchFlightLocations(
    query: string,
    limit: number,
  ): Promise<AutocompleteSuggestion[]> {
    const normalized = query.toLowerCase().trim();
    const upper = normalized.toUpperCase();
    const cacheKey = `flight:${normalized}:${limit}`;

    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    await this.warmUp();

    // Empty query → popular locations + a few airports/airlines
    if (!normalized) {
      const [rows, airports, airlines] = await Promise.all([
        this.prisma.flightLocation.findMany({
          where: { enabled: true },
          orderBy: { popularityScore: 'desc' },
          take: Math.min(limit, 8),
        }),
        this.prisma.airportReference.findMany({
          where: { enabled: true },
          orderBy: { name: 'asc' },
          take: Math.min(limit, 8),
        }),
        this.prisma.airlineReference.findMany({
          where: { enabled: true },
          orderBy: { name: 'asc' },
          take: Math.min(limit, 4),
        }),
      ]);
      const result = [
        ...rows.map((r) => this.mapFlightLocation(r)),
        ...airports.map((a) => this.mapAirport(a)),
        ...airlines.map((a) => this.mapAirline(a)),
      ].slice(0, limit);
      cacheSet(cacheKey, result);
      return result;
    }

    // SQLite LIKE with prefix ('q%') can use the index → ms-fast.
    const prefix = `${normalized}%`;
    const [flightRows, airportRows, airlineRows] = await Promise.all([
      this.prisma.reference.$queryRawUnsafe(
        `SELECT "id","code","type","name","cityName","countryCode","countryName","iataCityCode","popularityScore"
           FROM "FlightLocation" WHERE "enabled" = 1
           AND (LOWER("name") LIKE ? OR LOWER(COALESCE("cityName",'')) LIKE ?
                OR LOWER(COALESCE("countryName",'')) LIKE ? OR "code" = ? OR "iataCityCode" = ?)
           ORDER BY "popularityScore" DESC LIMIT ?`,
        prefix, prefix, prefix, upper, upper, limit * 2,
      ),
      this.prisma.reference.$queryRawUnsafe(
        `SELECT "id","iataCode","name","cityName","countryCode","countryName"
           FROM "AirportReference" WHERE "enabled" = 1
           AND (LOWER("name") LIKE ? OR LOWER(COALESCE("cityName",'')) LIKE ? OR "iataCode" = ?)
           ORDER BY "name" ASC LIMIT ?`,
        prefix, prefix, upper, limit * 2,
      ),
      this.prisma.reference.$queryRawUnsafe(
        `SELECT "id","iataCode","name","countryCode"
           FROM "AirlineReference" WHERE "enabled" = 1
           AND (LOWER("name") LIKE ? OR "iataCode" = ?)
           ORDER BY "name" ASC LIMIT ?`,
         prefix, upper, Math.min(limit, 8),
      ),
    ]);

    const seen = new Set<string>();
    const out: AutocompleteSuggestion[] = [];
    const push = (s: AutocompleteSuggestion) => {
      const key = `${s.type}:${s.code ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(s);
    };
    const rank = (label: string, code?: string): number =>
      code && code.toUpperCase() === upper
        ? 0
        : label.toLowerCase().startsWith(normalized)
          ? 1
          : 2;

    for (const r of (flightRows as any[])
      .slice()
      .sort(
        (a, b) =>
          rank(a.name, a.code) - rank(b.name, b.code) ||
          (b.popularityScore ?? 0) - (a.popularityScore ?? 0),
      )) {
      push(this.mapFlightLocation(r));
    }
    for (const r of (airportRows as any[])
      .slice()
      .sort((a, b) => rank(a.name, a.iataCode) - rank(b.name, b.iataCode))) {
      push(this.mapAirport(r));
    }
    for (const r of (airlineRows as any[])
      .slice()
      .sort((a, b) => rank(a.name, a.iataCode) - rank(b.name, b.iataCode))) {
      push(this.mapAirline(r));
    }

    const result = out.slice(0, limit);
    cacheSet(cacheKey, result);
    return result;
  }

  // ── Private helpers ──────────────────────────────────────

  private async searchDbDestinations(
    normalized: string,
    limit: number,
  ): Promise<AutocompleteSuggestion[]> {
    // IATA-coded destinations have actual provider mappings.
    // gn-* (Geonames) entries only used as geo fallback for towns without IATA codes.
    // Deduplication: when both an IATA and a gn-* entry exist for the same city,
    // keep only the IATA one. Keep gn-* ONLY when no matching IATA entry exists.
    const contentFilter = {
      enabled: true,
      contentStatus: { in: ['partial', 'ready'] },
    };
    const geonamesFilter = { code: { startsWith: 'gn-' } };

    if (!normalized) {
      const rows = await this.prisma.destinations.findMany({
        where: { OR: [contentFilter, geonamesFilter] },
        orderBy: { displayOrder: 'asc' },
        take: limit,
        // Ponytail: skip providerMappings — only needed on select, not autocomplete
      });
      return rows.map((r) => this.mapDestination(r));
    }

    const textSearch = {
      OR: [
        { normalizedName: { startsWith: normalized } },
        { code: { equals: normalized } },
        { countryCode: { equals: normalized.toUpperCase() } },
        { countryName: { startsWith: normalized } },
        { cityName: { startsWith: normalized } },
      ],
    };

    // Ponytail: prefix search only (index-friendly, ms-fast). The old `contains`
    // (LIKE %q%) forced a full scan of 72k destinations per keystroke.
    const rows = await this.prisma.destinations.findMany({
      where: {
        AND: [{ OR: [contentFilter, geonamesFilter] }, textSearch],
      },
      orderBy: { displayOrder: 'asc' },
      take: limit * 2,
      // Ponytail: skip providerMappings — only needed on select, not autocomplete
    });

    // Rank: exact code match → prefix name → contains name
    // Within each tier: IATA codes first, then gn-* fallback
    const isIata = (r: { code: string }) => !r.code.startsWith('gn-');

    const exactCode = rows.filter((r) => r.code.toLowerCase() === normalized);
    exactCode.sort((a, b) => (isIata(a) === isIata(b) ? 0 : isIata(a) ? -1 : 1));

    const prefixName = rows.filter(
      (r) =>
        r.code.toLowerCase() !== normalized &&
        r.normalizedName.startsWith(normalized),
    );
    prefixName.sort((a, b) => (isIata(a) === isIata(b) ? 0 : isIata(a) ? -1 : 1));

    // If prefix matches are scarce, also include ALREADY-FETCHED contains matches
    // (bounded to the rows we pulled) — no extra scan.
    const containsName = rows.filter(
      (r) =>
        r.code.toLowerCase() !== normalized &&
        !r.normalizedName.startsWith(normalized) &&
        r.normalizedName.includes(normalized),
    );
    containsName.sort((a, b) => (isIata(a) === isIata(b) ? 0 : isIata(a) ? -1 : 1));

    const deduped = this.dedupGeonames([...exactCode, ...prefixName, ...containsName], limit);
    return deduped.map((r) => this.mapDestination(r));
  }

  /**
   * Remove gn-* entries that duplicate an IATA entry by normalized name.
   * gn-* entries are geo fallback — only useful when no IATA entry exists for that city.
   */
  private dedupGeonames<T extends { code: string; normalizedName: string }>(
    results: T[],
    limit: number,
  ): T[] {
    const iataNames = new Set(
      results.filter((r) => !r.code.startsWith('gn-')).map((r) => r.normalizedName),
    );
    const filtered = results.filter(
      (r) => !r.code.startsWith('gn-') || !iataNames.has(r.normalizedName),
    );
    return filtered.slice(0, limit);
  }

  private async searchDbHotels(
    normalized: string,
    destinationCode: string | undefined,
    limit: number,
  ): Promise<AutocompleteSuggestion[]> {
    // Ponytail: hotel-name autocomplete MUST come from reference.db CanonicalHotel
    // (has normalizedName index → prefix-fast). NEVER scan content.db (10GB) per
    // keystroke — the destination-scoped + amadeus-extras queries there were the
    // 9s+ slow path. Use startsWith (index-friendly), not contains (full scan).
    const where: any = {
      mergeStatus: 'active',
      normalizedName: { startsWith: normalized },
    };

    if (destinationCode) {
      where.city = destinationCode;
    }

    const canonicals = await this.prisma.hotels.findMany({
      where,
      take: limit,
      orderBy: { normalizedName: 'asc' },
      select: {
        id: true,
        name: true,
        city: true,
        countryCode: true,
        latitude: true,
        longitude: true,
      },
    });

    // Ponytail: CanonicalHotel already carries city + countryCode in reference.db.
    // No content.db (10GB) lookup needed — avoids the cross-DB read per keystroke.
    return canonicals.map((c) => {
      const city = c.city || '';
      const country = c.countryCode || '';
      return {
        id: c.id,
        module: 'hotels' as const,
        type: 'HOTEL' as const,
        label: c.name,
        subtitle: [city, country].filter(Boolean).join(', '),
        canonicalHotelId: c.id,
        providerMappings: [],
        searchPayload: {
          canonicalHotelId: c.id,
          ...(c.latitude != null && c.longitude != null
            ? { latitude: c.latitude, longitude: c.longitude, radiusKm: 15 }
            : {}),
        },
      } as AutocompleteSuggestion;
    });
  }

  private mapDestination(row: any): AutocompleteSuggestion {
    const providerMappings = (row.providerMappings ?? []).map((m: any) => ({
      provider: m.provider,
      code: m.providerCode,
      codeType: m.providerCodeType,
    }));

    // Ponytail: flag country-level destinations (code == countryCode, no city).
    // Enables country → cities expansion in autocomplete (e.g. "Nigeria" → cities).
    const isCountryLevel =
      !!row.countryCode &&
      row.code === row.countryCode &&
      !row.cityName;

    const searchPayload: Record<string, unknown> = {
      destinationCode: row.code,
    };
    if (isCountryLevel) searchPayload.countryLevel = true;

    if (row.latitude != null && row.longitude != null) {
      searchPayload.latitude = row.latitude;
      searchPayload.longitude = row.longitude;
      searchPayload.radiusKm = isCountryLevel ? 500 : 15;
    }

    const isIata = !row.code.startsWith('gn-');
    const country = row.countryName || row.countryCode || '';
    const subtitleParts = [row.cityName, country].filter(
      (v: string) => v && v !== row.name,
    );
    // ponytail: if subtitle is empty from field dedup, fall back to country code
    const subtitle = subtitleParts.length > 0
      ? subtitleParts.join(', ')
      : (country || row.countryCode || '');

    const label = isIata && row.code && row.code !== row.name
      ? `${row.name} (${row.code})`
      : row.name;

    return {
      id: row.id,
      module: 'hotels',
      type: 'HOTEL_DESTINATION',
      label,
      subtitle,
      code: isIata ? row.code : undefined,
      destinationCode: row.code,
      providerMappings,
      searchPayload,
    };
  }

  private mapFlightLocation(
    row: any,
  ): AutocompleteSuggestion {
    const isCity = row.type === 'CITY' || row.type === 'METRO_AREA';
    const type = row.type as AutocompleteSuggestion['type'];

    const searchPayload: Record<string, unknown> = isCity
      ? { from: row.code, fromType: 'CITY_OR_AIRPORT' }
      : { from: row.code, fromType: 'AIRPORT' };

    return {
      id: row.id,
      module: 'flights',
      type,
      label: isCity ? (row.cityName ?? row.name) : row.name,
      subtitle: [row.cityName ?? row.name, row.countryName]
        .filter(Boolean)
        .join(', '),
      code: row.code,
      destinationCode: row.iataCityCode,
      searchPayload,
    };
  }

  private mapAirport(row: any): AutocompleteSuggestion {
    return {
      id: `airport-${row.iataCode}`,
      module: 'flights',
      type: 'AIRPORT',
      label: `${row.name} (${row.iataCode})`,
      subtitle: [row.cityName, row.countryName ?? row.countryCode]
        .filter(Boolean)
        .join(', '),
      code: row.iataCode,
      destinationCode: row.cityName ?? undefined,
      searchPayload: { from: row.iataCode, fromType: 'AIRPORT' },
    };
  }

  private mapAirline(row: any): AutocompleteSuggestion {
    return {
      id: `airline-${row.iataCode}`,
      module: 'flights',
      type: 'AIRLINE',
      label: `${row.name} (${row.iataCode})`,
      subtitle: row.countryCode ? `Airline · ${row.countryCode}` : 'Airline',
      code: row.iataCode,
      searchPayload: { airline: row.iataCode },
    };
  }
}
