import { getBoolean, getNumber, getString } from '../env.utils';

const VALID_DUMP_STORAGES = ['local', 's3'] as const;
const VALID_RAW_PAYLOAD_MODES = ['none', 'summary', 'full'] as const;

export type DumpStorageMode = (typeof VALID_DUMP_STORAGES)[number];
export type RawPayloadMode = (typeof VALID_RAW_PAYLOAD_MODES)[number];

export interface HotelContentRuntimeConfig {
  enrichmentEnabled: boolean;
  recoverySyncEnabled: boolean;
  syncBatchSize: number;
  syncIntervalMinutes: number;
  syncIntervalSeconds: number;
  defaultLanguage: string;
  staleDays: number;
  enableCanonicalMatching: boolean;
  /** Storage backend for raw provider dump files: 'local' (filesystem) or 's3' (object storage) */
  dumpStorage: DumpStorageMode;
  /** Directory path for local dump storage when dumpStorage='local' */
  dumpLocalDir: string;
  /** Number of days to retain raw dump files before cleanup */
  dumpRetentionDays: number;
  /** How much raw provider payload to store in the DB: 'none' | 'summary' | 'full' */
  rawPayloadMode: RawPayloadMode;
  /** Enable demo/MVP fallback enrichment for missing informational content */
  fallbackEnabled: boolean;
  /** Base URL for fallback hotel images (served from /public) */
  fallbackImageBaseUrl: string;
  /** Default inventory filter for RateHawk dump API (e.g. 'all') */
  ratehawkDumpInventory: string;
  /** Batch size for region content upserts during dump import */
  ratehawkDumpRegionBatchSize: number;
}

function parseDumpStorage(value: string | undefined): DumpStorageMode {
  const raw = value?.trim().toLowerCase();
  if (!raw) return 'local';
  if (VALID_DUMP_STORAGES.includes(raw as DumpStorageMode)) return raw as DumpStorageMode;
  throw new Error(`Invalid HOTEL_CONTENT_DUMP_STORAGE: "${value}". Expected one of: ${VALID_DUMP_STORAGES.join(', ')}`);
}

function parseRawPayloadMode(value: string | undefined): RawPayloadMode {
  const raw = value?.trim().toLowerCase();
  if (!raw) return 'summary';
  if (VALID_RAW_PAYLOAD_MODES.includes(raw as RawPayloadMode)) return raw as RawPayloadMode;
  throw new Error(`Invalid HOTEL_CONTENT_RAW_PAYLOAD_MODE: "${value}". Expected one of: ${VALID_RAW_PAYLOAD_MODES.join(', ')}`);
}

export function buildHotelContentConfig(
  env: NodeJS.ProcessEnv,
): HotelContentRuntimeConfig {
  return {
    enrichmentEnabled: getBoolean(env, 'HOTEL_CONTENT_ENRICHMENT_ENABLED', true),
    recoverySyncEnabled: getBoolean(env, 'HOTEL_CONTENT_RECOVERY_SYNC_ENABLED', false),
    syncBatchSize: getNumber(env, 'HOTEL_CONTENT_SYNC_BATCH_SIZE', 100),
    syncIntervalMinutes: getNumber(env, 'HOTEL_CONTENT_SYNC_INTERVAL_MINUTES', 5),
    syncIntervalSeconds: getNumber(env, 'HOTEL_CONTENT_SYNC_INTERVAL_SECONDS', 60),
    defaultLanguage: getString(env, 'HOTEL_CONTENT_DEFAULT_LANGUAGE', 'en') ?? 'en',
    staleDays: getNumber(env, 'HOTEL_CONTENT_STALE_DAYS', 30),
    enableCanonicalMatching: getBoolean(env, 'HOTEL_CONTENT_ENABLE_CANONICAL_MATCHING', true),
    dumpStorage: parseDumpStorage(env['HOTEL_CONTENT_DUMP_STORAGE']),
    dumpLocalDir: getString(env, 'HOTEL_CONTENT_DUMP_LOCAL_DIR', './storage/hotel-content-dumps') ?? './storage/hotel-content-dumps',
    dumpRetentionDays: getNumber(env, 'HOTEL_CONTENT_DUMP_RETENTION_DAYS', 14),
    rawPayloadMode: parseRawPayloadMode(env['HOTEL_CONTENT_RAW_PAYLOAD_MODE']),
    fallbackEnabled: getBoolean(env, 'HOTEL_CONTENT_FALLBACK_ENABLED', true),
    fallbackImageBaseUrl: getString(env, 'HOTEL_CONTENT_FALLBACK_IMAGE_BASE_URL', '/images/home/hotels') ?? '/images/home/hotels',
    ratehawkDumpInventory: getString(env, 'RATEHAWK_DUMP_INVENTORY', 'all') ?? 'all',
    ratehawkDumpRegionBatchSize: getNumber(env, 'RATEHAWK_DUMP_REGION_BATCH_SIZE', 500),
  };
}
