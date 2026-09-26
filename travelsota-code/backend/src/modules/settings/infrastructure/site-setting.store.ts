import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';

/**
 * Simple key-value store backed by the SiteSetting table.
 * Values are JSON-serialised. Reads are cached in-memory and
 * invalidated on writes.
 */
@Injectable()
export class SiteSettingStore {
  private readonly logger = new Logger(SiteSettingStore.name);
  private cache = new Map<string, unknown>();

  constructor(private readonly prisma: PrismaService) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    if (this.cache.has(key)) return this.cache.get(key) as T;

    const row = await this.prisma.siteSetting.findUnique({ where: { key } });
    if (!row) return null;

    const value = row.value as T;
    this.cache.set(key, value);
    return value;
  }

  async getOrInit<T>(key: string, defaultValue: T): Promise<T> {
    const existing = await this.get<T>(key);
    if (existing !== null) return existing;
    await this.set(key, defaultValue);
    return defaultValue;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: value as any },
      update: { value: value as any },
    });
    this.cache.set(key, value);
    this.logger.debug(`Site setting updated: ${key}`);
  }

  /** Bust the in-memory cache for a key (or all keys). */
  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}
