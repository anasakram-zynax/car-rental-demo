import type {
  ModuleKey,
  ProviderConfigRecord,
  ProviderKey,
} from '../../domain/provider-config.entity';

export interface ProviderConfigStorePort {
  findAll(): Promise<ProviderConfigRecord[]>;
  findOne(module: ModuleKey, provider: ProviderKey): Promise<ProviderConfigRecord | null>;
  upsert(record: ProviderConfigRecord): Promise<ProviderConfigRecord>;
}
