import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { ProviderConfigStorePort } from '../application/ports/provider-config-store.port';
import type {
  ModuleKey,
  ProviderConfigRecord,
  ProviderKey,
} from '../domain/provider-config.entity';

@Injectable()
export class DbProviderConfigStore implements ProviderConfigStorePort {
  constructor(private readonly prisma: PrismaService) {}

  // Short-TTL read cache: runtime config is fetched on EVERY supplier call
  // (search/retrieve/book per provider). Config changes rarely; 30s stale is
  // invisible operationally. Busted on upsert below.
  private readonly readCache = new Map<string, { row: ProviderConfigRecord | null; expiresAt: number }>();
  private static readonly READ_TTL_MS = 30_000;

  async findAll(): Promise<ProviderConfigRecord[]> {
    const rows = await this.prisma.providerConfig.findMany();
    return rows.map(this.toDomain);
  }

  async findOne(
    module: ModuleKey,
    provider: ProviderKey,
  ): Promise<ProviderConfigRecord | null> {
    const key = `${module}:${provider}`;
    const hit = this.readCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.row;
    const row = await this.prisma.providerConfig.findUnique({
      where: { module_provider: { module, provider } },
    });
    const record = row ? this.toDomain(row) : null;
    this.readCache.set(key, { row: record, expiresAt: Date.now() + DbProviderConfigStore.READ_TTL_MS });
    return record;
  }

  async upsert(record: ProviderConfigRecord): Promise<ProviderConfigRecord> {
    const row = await this.prisma.providerConfig.upsert({
      where: {
        module_provider: { module: record.module, provider: record.provider },
      },
      create: {
        module: record.module,
        provider: record.provider,
        enabled: record.enabled,
        encryptedConfig: JSON.stringify(record.config ?? {}),
      },
      update: {
        enabled: record.enabled,
        encryptedConfig: JSON.stringify(record.config ?? {}),
      },
    });
    this.readCache.delete(`${record.module}:${record.provider}`);
    return this.toDomain(row);
  }

  private toDomain(row: {
    id: string;
    module: string;
    provider: string;
    enabled: boolean;
    encryptedConfig: string;
    updatedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ProviderConfigRecord {
    return {
      module: row.module as ModuleKey,
      provider: row.provider as ProviderKey,
      enabled: row.enabled,
      config: JSON.parse(row.encryptedConfig),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
