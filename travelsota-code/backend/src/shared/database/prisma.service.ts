import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';

import { PrismaClient } from '../../generated';
import { PrismaClient as ReferencePrismaClient } from '../../generated/reference-client';
import { PrismaClient as ContentPrismaClient } from '../../generated/content-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaLibSql } from '@prisma/adapter-libsql';

// Models that live in the SQLite reference database (small catalog: hotels,
// supplier links, destinations). Hot path — autocomplete, grouping, mapping.
const REFERENCE_MODELS = new Set([
  'hotels',
  'hotelSupplierLinks',
  'destinations',
  'destinationSupplierCodes',
  'flightLocation',
  'airportReference',
  'airlineReference',
]);

// Models that live in the SQLite content database (big supplier content).
const CONTENT_MODELS = new Set([
  'hotelContent',
  'supplierDestinations',
  'supplierRegions',
  'importJobs',
  'importJobItems',
]);

// Content model accessors — typed getters so TypeScript knows these exist.
// Backed by installModelProxy() which creates runtime getters.
declare module './prisma.service' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface PrismaService extends ReferenceModelAccessors, ContentModelAccessors {}
}

interface ReferenceModelAccessors {
  readonly hotels: ReferencePrismaClient['hotels'];
  readonly hotelSupplierLinks: ReferencePrismaClient['hotelSupplierLinks'];
  readonly destinations: ReferencePrismaClient['destinations'];
  readonly destinationSupplierCodes: ReferencePrismaClient['destinationSupplierCodes'];
  readonly reference: ReferencePrismaClient;
}

interface ContentModelAccessors {
  readonly hotelContent: ContentPrismaClient['hotelContent'];
  readonly supplierDestinations: ContentPrismaClient['supplierDestinations'];
  readonly supplierRegions: ContentPrismaClient['supplierRegions'];
  readonly importJobs: ContentPrismaClient['importJobs'];
  readonly importJobItems: ContentPrismaClient['importJobItems'];
  readonly content: ContentPrismaClient;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(PrismaService.name);
  private _reference: ReferencePrismaClient | null = null;
  private _content: ContentPrismaClient | null = null;

  /** Direct access to the SQLite reference client (catalog tables). */
  get reference(): ReferencePrismaClient {
    if (!this._reference) {
      this._reference = this.createSqliteClient(
        process.env.REFERENCE_DB_PATH || 'reference.db',
        'reference',
      ) as ReferencePrismaClient;
    }
    return this._reference;
  }

  /** Direct access to the SQLite content client (supplier content). */
  get content(): ContentPrismaClient {
    if (!this._content) {
      this._content = this.createSqliteClient(
        process.env.CONTENT_DB_PATH || 'content.db',
        'content',
      ) as ContentPrismaClient;
    }
    return this._content;
  }

  constructor() {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) {
      throw new Error('DATABASE_URL is not set');
    }

    // Runtime API must use pooled DATABASE_URL. DATABASE_DIRECT_URL is for migrations/admin jobs.
    const connUrlString = rawUrl;

    let finalUrl = connUrlString;
    if (!finalUrl.includes('sslmode=')) {
      const sep = finalUrl.includes('?') ? '&' : '?';
      finalUrl = `${finalUrl}${sep}sslmode=no-verify`;
    }

    const appRole = process.env.APP_ROLE ?? 'api';
    const defaultPool = appRole === 'worker' ? 2 : 15;
    const max = parseInt(
      process.env.PRISMA_POOL_MAX || String(defaultPool),
      10,
    );

    const appNameSep = finalUrl.includes('?') ? '&' : '?';
    finalUrl = `${finalUrl}${appNameSep}application_name=travelsota-${appRole}-${process.pid}`;

    const adapter = new PrismaPg({
      connectionString: finalUrl,
      max,
      // Keep warm connections: min:0 + a 10s idle timeout made every request
      // after an idle gap pay a full DB reconnect (TCP+TLS+auth), which
      // showed up as a flat ~0.3-0.8s tax on ALL endpoints (auth/me
      // measured at 1.3-2.5s server time). Hold 2 hot connections and let
      // idle ones linger 5 minutes instead.
      min: parseInt(process.env.PRISMA_POOL_MIN || '2', 10),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: parseInt(process.env.PRISMA_POOL_IDLE_MS || '300_000', 10),
      statement_timeout: 15_000,
      query_timeout: 20_000,
    });

    super({ adapter });

    // Route model access by name: reference models → reference.db,
    // content models → content.db, everything else → PG.
    this.installModelProxy();

    this.logger.log(
      `PG host=${new URL(connUrlString).hostname} pool=${max} | reference db=${process.env.REFERENCE_DB_PATH || 'reference.db'} | content db=${process.env.CONTENT_DB_PATH || 'content.db'}`,
    );
  }

  /** Content DB is available once SQLite connects successfully */
  hotelContentTablesExist = false;
  /** Reference DB is available once SQLite connects successfully */
  referenceTablesExist = false;

  onModuleInit() {
    void this.initDatabases()
      .then(() => {
        this.logger.log('PrismaService initialized (PG + SQLite).');
      })
      .catch((error) => {
        this.hotelContentTablesExist = false;
        this.referenceTablesExist = false;
        this.logger.warn(
          `Database init failed: ${(error as Error).message}. App will start without DB.`,
        );
      });
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms),
      ),
    ]);
  }

  private async initDatabases(): Promise<void> {
    // PG connect is best-effort — the PrismaPg pool connects lazily anyway.
    try {
      await this.withTimeout(this.$connect(), 20_000);
    } catch (e) {
      this.logger.warn(`PG $connect slow/failed: ${(e as Error).message} — continuing with lazy pool`);
    }

    // SQLite tables: bounded attempts — a hung first query must never leave
    // enrichment silently disabled forever.
    try {
      await Promise.all([
        this.ensureTables('reference', 'reference-migration.sql', () => this.reference.destinations.count()),
        this.ensureTables('content', 'content-migration.sql', () => this.content.supplierDestinations.count()),
      ]);
    } catch (e) {
      this.logger.warn(`ensureTables failed (non-fatal): ${(e as Error).message}`);
    }

    // Enable WAL mode on content.db for concurrent read/write.
    // Without WAL, import writes block search reads → site slowdown.
    try {
      const mode = await this.content.$queryRawUnsafe<{ journal_mode: string }[]>(
        `PRAGMA journal_mode`,
      );
      if (mode[0]?.journal_mode !== 'wal') {
        await this.content.$executeRawUnsafe(`PRAGMA journal_mode=WAL`);
        this.logger.log('content.db switched to WAL mode for concurrent access');
      }
    } catch {
      // Non-fatal: falls back to default journal mode
    }

    // FK rebuild + column additions: run once, never block boot.
    // Errors are logged but never propagated — these are idempotent repairs.
    this.dropLegacyContentFks().catch((e) => this.logger.warn(`dropLegacyContentFks (bg): ${e}`));
    this.ensureReferenceColumns().catch((e) => this.logger.warn(`ensureReferenceColumns (bg): ${e}`));
  }

  /** Add newer reference columns to pre-existing SQLite DBs (idempotent). */
  private async ensureReferenceColumns(): Promise<void> {
    if (!this.referenceTablesExist) return;
    const alters: Array<[string, string]> = [
      ['SupportedHotelDestinationProvider', `ALTER TABLE "SupportedHotelDestinationProvider" ADD COLUMN "matchMethod" TEXT NOT NULL DEFAULT 'auto'`],
      ['SupportedHotelDestinationProvider', `ALTER TABLE "SupportedHotelDestinationProvider" ADD COLUMN "confidence" REAL NOT NULL DEFAULT 0.5`],
      ['SupportedHotelDestinationProvider', `ALTER TABLE "SupportedHotelDestinationProvider" ADD COLUMN "lastVerifiedAt" DATETIME`],
    ];
    for (const [table, sql] of alters) {
      try {
        const cols = (await this.reference.$queryRawUnsafe(`PRAGMA table_info('${table}')`)) as Array<{ name: string }>;
        const colName = sql.match(/ADD COLUMN "(\w+)"/)?.[1];
        if (colName && cols.some((c) => c.name === colName)) continue;
        await this.reference.$executeRawUnsafe(sql);
        this.logger.log(`reference.db: added column ${colName} to ${table}`);
      } catch (e) {
        this.logger.warn(`ensureReferenceColumns ${table} failed (non-fatal): ${(e as Error).message}`);
      }
    }
  }

  /**
   * Legacy monolith content.db files carry a physical FK
   * (HotelStaticContent.canonicalHotelId → CanonicalHotel). Canonical hotels
   * now live in reference.db, so that FK rejects every content write with a
   * canonical id. Current schema intends soft links only — rebuild the table
   * without constraints if any FK is found. No-op on fresh DBs.
   */
  private async dropLegacyContentFks(): Promise<void> {
    if (!this.hotelContentTablesExist) return;
    try {
      const fks = (await this.content.$queryRawUnsafe(
        `PRAGMA foreign_key_list('HotelStaticContent')`,
      )) as Array<Record<string, unknown>>;
      if (!fks.length) return;

      this.logger.warn(
        `Legacy FK detected on HotelStaticContent (${fks.length} constraint(s)) — rebuilding table without FKs`,
      );
      const ddlRow = (await this.content.$queryRawUnsafe(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='HotelStaticContent'`,
      )) as Array<{ sql: string }>;
      // Line-based constraint strip: drop every line from a CONSTRAINT def
      // until the table-closing paren; collapse leftover trailing comma.
      const ddlLines = ddlRow[0].sql.split('\n');
      const kept: string[] = [];
      let skipping = false;
      for (const line of ddlLines) {
        if (/^\s*,?\s*CONSTRAINT\b/i.test(line)) { skipping = true; continue; }
        if (skipping) {
          if (/^\s*\)/.test(line)) { skipping = false; kept.push(line); }
          continue;
        }
        kept.push(line);
      }
      const createTable = kept.join('\n').replace(/,(\s*\n\s*\))/, '$1');
      const indexes = (await this.content.$queryRawUnsafe(
        `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='HotelStaticContent' AND sql IS NOT NULL`,
      )) as Array<{ name: string; sql: string }>;

      const exec = (sql: string) => this.content.$executeRawUnsafe(sql);
      await exec(`PRAGMA foreign_keys=OFF`);
      try {
        await this.content.$transaction(
          async (tx) => {
            const tExec = (sql: string) => tx.$executeRawUnsafe(sql);
            await tExec(`DROP TABLE IF EXISTS "HotelStaticContent_legacy_rebuild"`);
            await tExec(createTable.replace(/CREATE TABLE "HotelStaticContent"/i, 'CREATE TABLE "HotelStaticContent_legacy_rebuild"'));
            await tExec(`INSERT INTO "HotelStaticContent_legacy_rebuild" SELECT * FROM "HotelStaticContent"`);
            await tExec(`DROP TABLE "HotelStaticContent"`);
            await tExec(`ALTER TABLE "HotelStaticContent_legacy_rebuild" RENAME TO "HotelStaticContent"`);
            // DROP TABLE removed the indexes — recreate under original names
            for (const idx of indexes) await tExec(idx.sql);
          },
          { timeout: 60_000 },
        );
      } finally {
        await exec(`PRAGMA foreign_keys=ON`).catch(() => {});
      }
      this.logger.log('HotelStaticContent rebuilt without legacy FK constraints.');
    } catch (e) {
      this.logger.warn(`dropLegacyContentFks failed (non-fatal): ${(e as Error).message}`);
    }
  }

  /**
   * Ensure a SQLite database's tables exist (creates them if missing).
   * Retries with backoff, then keeps polling in the background so the
   * availability flag flips on the moment the DB becomes usable.
   */
  private async ensureTables(
    kind: 'reference' | 'content',
    migrationFile: string,
    probe: () => Promise<unknown>,
  ): Promise<void> {
    const flagName = kind === 'reference' ? 'referenceTablesExist' : 'hotelContentTablesExist';
    const setFlag = (v: boolean) => {
      if (kind === 'reference') this.referenceTablesExist = v;
      else this.hotelContentTablesExist = v;
    };

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.withTimeout(probe(), 10_000);
        setFlag(true);
        this.logger.log(`SQLite ${kind} tables available.`);
        return;
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        this.logger.warn(`SQLite ${kind} check attempt ${attempt}/5 failed: ${msg}`);
        if (/no such table/i.test(msg)) {
          try {
            const sql = require('fs').readFileSync(
              require('path').resolve(__dirname, `../../prisma/${migrationFile}`),
              'utf8',
            );
            const statements = sql.split(';').filter((s: string) => s.trim());
            const client = kind === 'reference' ? this.reference : this.content;
            for (const stmt of statements) {
              await this.withTimeout(client.$executeRawUnsafe(stmt), 15_000);
            }
          } catch (migErr: any) {
            this.logger.warn(`SQLite ${kind} migration failed: ${migErr?.message ?? migErr}`);
          }
        }
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }

    // Background retry — becomes available the moment the DB is usable.
    const timer = setInterval(() => {
      void this.withTimeout(probe(), 10_000)
        .then(() => {
          setFlag(true);
          clearInterval(timer);
          this.logger.log(`SQLite ${kind} tables became available (background retry).`);
        })
        .catch(() => {});
    }, 60_000);
    timer.unref?.();
  }

  async onApplicationShutdown() {
    await this.$disconnect().catch(() => {});
    if (this._reference) {
      await this._reference.$disconnect().catch(() => {});
    }
    if (this._content) {
      await this._content.$disconnect().catch(() => {});
    }
  }

  // ── SQLite client factory ──────────────────────────────

  private createSqliteClient(
    dbPath: string,
    kind: 'reference' | 'content',
  ): ReferencePrismaClient | ContentPrismaClient {
    const dir = require('path').dirname(dbPath);
    if (dir && dir !== '.') {
      require('fs').mkdirSync(dir, { recursive: true });
    }
    const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
    const client =
      kind === 'reference'
        ? new ReferencePrismaClient({ adapter })
        : new ContentPrismaClient({ adapter });
    this.logger.log(`SQLite ${kind} database connected: ${dbPath}`);
    return client;
  }

  // ── Proxy: route models to the right SQLite client ─────

  private installModelProxy(): void {
    const self = this as any;

    const getReference = () => {
      if (!this._reference) {
        this._reference = this.createSqliteClient(
          process.env.REFERENCE_DB_PATH || 'reference.db',
          'reference',
        ) as ReferencePrismaClient;
      }
      return this._reference;
    };

    const getContent = () => {
      if (!this._content) {
        this._content = this.createSqliteClient(
          process.env.CONTENT_DB_PATH || 'content.db',
          'content',
        ) as ContentPrismaClient;
      }
      return this._content;
    };

    for (const modelName of REFERENCE_MODELS) {
      Object.defineProperty(self, modelName, {
        get() {
          const c = getReference();
          return (c as any)[modelName];
        },
        enumerable: true,
        configurable: true,
      });
    }

    for (const modelName of CONTENT_MODELS) {
      Object.defineProperty(self, modelName, {
        get() {
          const c = getContent();
          return (c as any)[modelName];
        },
        enumerable: true,
        configurable: true,
      });
    }

    // Content-specific raw queries should use prisma.content.$queryRaw directly.
    // PG $queryRaw/$transaction on superclass handles PG models.
  }
}
