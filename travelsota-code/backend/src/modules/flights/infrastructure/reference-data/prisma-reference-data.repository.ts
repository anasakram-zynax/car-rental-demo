import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type { NormalizedAirline, NormalizedAirport, SyncStats } from './reference-data.types';

const BATCH_SIZE = 100;
const CONCURRENCY = 5;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — reference data rarely changes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class PrismaReferenceDataRepository {
  private readonly logger = new Logger(PrismaReferenceDataRepository.name);
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly prisma: PrismaService) {}

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.data as T;
    this.cache.delete(key);
    return undefined;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  private cacheKey(prefix: string, codes: string[]): string {
    return `${prefix}:${[...codes].sort().join(',')}`;
  }

  private async upsertBatch<T>(
    items: T[],
    upsertFn: (item: T) => Promise<{ createdAt: Date; updatedAt: Date }>,
    entityLabel: string,
  ): Promise<{ created: number; updated: number; failed: number }> {
    let created = 0;
    let updated = 0;
    let failed = 0;
    let idx = 0;

    const runNext = async (): Promise<void> => {
      while (true) {
        const i = idx++;
        if (i >= items.length) break;
        const item = items[i];
        try {
          const result = await upsertFn(item);
          if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
          else updated++;
        } catch (err) {
          failed++;
          this.logger.warn(`${entityLabel} upsert failed: ${String(err)}`);
        }
      }
    };

    const workers: Promise<void>[] = [];
    for (let w = 0; w < CONCURRENCY; w++) {
      workers.push(runNext());
    }
    await Promise.all(workers);

    return { created, updated, failed };
  }

  async upsertAirlines(airlines: NormalizedAirline[]): Promise<Pick<SyncStats['airlines'], 'created' | 'updated' | 'failed'>> {
    return this.upsertBatch(
      airlines,
      (a) =>
        this.prisma.airlineReference.upsert({
          where: { iataCode: a.iataCode },
          create: {
            iataCode: a.iataCode,
            icaoCode: a.icaoCode,
            name: a.name,
            countryCode: a.countryCode,
            logoSymbolUrl: a.logoSymbolUrl,
            logoLockupUrl: a.logoLockupUrl,
            conditionsOfCarriageUrl: a.conditionsOfCarriageUrl,
            source: a.source,
            enabled: true,
          },
          update: {
            name: a.name,
            icaoCode: a.icaoCode,
            countryCode: a.countryCode,
            logoSymbolUrl: a.logoSymbolUrl,
            logoLockupUrl: a.logoLockupUrl,
            conditionsOfCarriageUrl: a.conditionsOfCarriageUrl,
            source: a.source,
          },
        }),
      'Airline',
    );
  }

  async upsertAirports(airports: NormalizedAirport[]): Promise<Pick<SyncStats['airports'], 'created' | 'updated' | 'failed'>> {
    return this.upsertBatch(
      airports,
      (a) =>
        this.prisma.airportReference.upsert({
          where: { iataCode: a.iataCode },
          create: {
            iataCode: a.iataCode,
            icaoCode: a.icaoCode,
            name: a.name,
            cityName: a.cityName,
            countryCode: a.countryCode,
            countryName: a.countryName,
            latitude: a.latitude,
            longitude: a.longitude,
            timezone: a.timezone,
            duffelCityId: a.duffelCityId,
            duffelPlaceId: a.duffelPlaceId,
            source: a.source,
            enabled: true,
          },
          update: {
            name: a.name,
            icaoCode: a.icaoCode,
            cityName: a.cityName,
            countryCode: a.countryCode,
            countryName: a.countryName,
            latitude: a.latitude,
            longitude: a.longitude,
            timezone: a.timezone,
            duffelCityId: a.duffelCityId,
            duffelPlaceId: a.duffelPlaceId,
            source: a.source,
          },
        }),
      'Airport',
    );
  }

  async findByAirlineIata(iataCode: string) {
    const key = `airline:${iataCode.toUpperCase()}`;
    const cached = this.getCached<NormalizedAirline>(key);
    if (cached) return cached;
    const result = await this.prisma.airlineReference.findUnique({ where: { iataCode } });
    if (result) this.setCache(key, result);
    return result;
  }

  async findAirlinesByCodes(codes: string[]) {
    if (codes.length === 0) return [];
    const key = this.cacheKey('airlines', codes);
    const cached = this.getCached<Array<{ iataCode: string; name: string; logoSymbolUrl: string | null; logoLockupUrl: string | null }>>(key);
    if (cached) return cached;
    const result = await this.prisma.airlineReference.findMany({
      where: { iataCode: { in: codes }, enabled: true },
    });
    this.setCache(key, result);
    return result;
  }

  async findAirportsByCodes(codes: string[]) {
    if (codes.length === 0) return [];
    const key = this.cacheKey('airports', codes);
    const cached = this.getCached<Array<{ iataCode: string; name: string; cityName: string | null }>>(key);
    if (cached) return cached;
    const result = await this.prisma.airportReference.findMany({
      where: { iataCode: { in: codes }, enabled: true },
    });
    this.setCache(key, result);
    return result;
  }

  async findByAirportIata(iataCode: string) {
    const key = `airport:${iataCode.toUpperCase()}`;
    const cached = this.getCached<NormalizedAirport>(key);
    if (cached) return cached;
    const result = await this.prisma.airportReference.findUnique({ where: { iataCode } });
    if (result) this.setCache(key, result);
    return result;
  }

  async countAirlines(): Promise<number> {
    return this.prisma.airlineReference.count();
  }

  async countAirports(): Promise<number> {
    return this.prisma.airportReference.count();
  }
}
