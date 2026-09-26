/**
 * One-time migration: split the combined content SQLite file into two.
 *
 * reference.db gets the catalog tables (Hotels, links, destinations);
 * content.db keeps only the big supplier-content tables.
 *
 * Run AFTER deploying the split build:
 *   node dist/scripts/split-content-db.js
 *
 * Env: CONTENT_DB_PATH (source), REFERENCE_DB_PATH (target, created if missing).
 */
import { PrismaClient as ReferenceClient } from '../generated/reference-client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import * as fs from 'fs';
import * as path from 'path';

const REFERENCE_TABLES = [
  'CanonicalHotel',
  'HotelProviderMapping',
  'SupportedHotelDestination',
  'SupportedHotelDestinationProvider',
];

async function main(): Promise<void> {
  const contentPath = process.env.CONTENT_DB_PATH || 'content.db';
  const referencePath = process.env.REFERENCE_DB_PATH || 'reference.db';

  console.log(`[SPLIT] source content.db=${contentPath}`);
  console.log(`[SPLIT] target reference.db=${referencePath}`);

  const dir = path.dirname(referencePath);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });

  const ref = new ReferenceClient({
    adapter: new PrismaLibSql({ url: `file:${referencePath}` }),
  });

  try {
    // 1. Ensure reference tables exist in the target file.
    // From dist/scripts, ../prisma = dist/prisma (build copies the SQL here).
    const migrationPath = path.resolve(__dirname, '../prisma/reference-migration.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const statements = sql.split(';').filter((s) => s.trim());
    for (const stmt of statements) {
      await ref.$executeRawUnsafe(stmt);
    }
    console.log('[SPLIT] reference tables ensured.');

    // 2. Attach the old combined content.db and copy the reference tables.
    const absSource = path.resolve(contentPath);
    await ref.$executeRawUnsafe(`ATTACH DATABASE '${absSource}' AS olddb`);

    for (const table of REFERENCE_TABLES) {
      try {
        const res = await ref.$executeRawUnsafe(
          `INSERT INTO "${table}" SELECT * FROM olddb."${table}"`,
        );
        console.log(`[SPLIT] copied ${table} (${res} rows)`);
      } catch (e: any) {
        console.warn(`[SPLIT] ${table} copy skipped: ${e?.message}`);
      }
    }

    await ref.$executeRawUnsafe('DETACH DATABASE olddb');
    console.log('[SPLIT] done.');
  } finally {
    await ref.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error('[SPLIT] failed:', e);
  process.exit(1);
});
