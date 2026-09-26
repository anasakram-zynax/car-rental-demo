/**
 * Repair double-encoding mojibake in SQLite hotel content.
 *
 * Some imported records stored UTF-8 bytes that were mis-decoded as Latin-1 /
 * Windows-1252 and re-saved as UTF-8 (e.g. "é" → "Ã©", "ñ" → "Ã±").
 * This reverses that corruption per table/column.
 *
 * Usage:
 *   node dist/scripts/fix-mojibake.js "file:reference.db" "file:content.db"
 */
import { createClient } from '@libsql/client';

function isMojibake(s: string): boolean {
  // These byte-patterns result from UTF-8 → Latin-1 double-encoding.
  return /Ã©|Ã±|Ã¢|Ã¡|Ã£|Ã¤|Ã¶|Ã¼|Â|â€|ï¿½|Ã­|Ã¯|Ã³|Ãº|Ã¨|Ã«|Ã®|Ã´|Ã¶/i.test(s);
}

function fix(s: string): string {
  try {
    const buf = Buffer.from(s, 'latin1');
    const out = buf.toString('utf8');
    // Heuristic: if it got worse (added more replacement-ish chars), keep original
    return isMojibake(out) ? s : out;
  } catch {
    return s;
  }
}

async function repairTable(
  db: ReturnType<typeof createClient>,
  table: string,
  cols: string[],
  idCol: string,
  label: string,
): Promise<number> {
  let count = 0;
  const toUpdate: Array<{ id: string; sets: Array<[string, string]> }> = [];
  const offset = 0;
  const LIMIT = 1000;
  let lastId: string | null = null;
  let totalInspected = 0;

  for (;;) {
    const rows = lastId
      ? await db.execute({
          sql: `SELECT ${idCol}, ${cols.join(', ')} FROM ${table} WHERE ${idCol} > ? ORDER BY ${idCol} LIMIT ?`,
          args: [lastId, LIMIT],
        })
      : await db.execute({
          sql: `SELECT ${idCol}, ${cols.join(', ')} FROM ${table} ORDER BY ${idCol} LIMIT ?`,
          args: [LIMIT],
        });

    if (rows.rows.length === 0) break;
    totalInspected += rows.rows.length;

    for (const row of rows.rows) {
      const id = String(row[idCol]);
      const sets: Array<[string, string]> = [];
      for (const col of cols) {
        const v = row[col];
        if (typeof v === 'string' && isMojibake(v)) {
          const fixed = fix(v);
          if (fixed !== v) sets.push([col, fixed]);
        }
      }
      if (sets.length) toUpdate.push({ id, sets });
      lastId = id;
    }
    if (rows.rows.length < LIMIT) break;
  }

  // Apply updates
  for (const { id, sets } of toUpdate) {
    const setClause = sets.map(([c]) => `"${c}" = ?`).join(', ');
    try {
      await db.execute({
        sql: `UPDATE ${table} SET ${setClause} WHERE ${idCol} = ?`,
        args: [...sets.map(([, v]) => v), id],
      });
      count++;
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn(`[FIX] ${label}: skip row ${id}: ${e?.message ?? e}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[FIX] ${label}(${table}): inspected ${totalInspected}, updated ${count}`);
  return count;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const urls: string[] = args.length
    ? args.map((a) => (a.startsWith('file:') ? a : `file:${a}`))
    : ['file:reference.db'];

  let total = 0;
  for (const url of urls) {
    // eslint-disable-next-line no-console
    console.log(`\n=== Repairing ${url} ===`);
    const db = createClient({ url });
    try {
      const tables = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table'",
      );
      const tableNames = tables.rows.map((r) => String(r.name));

      if (tableNames.includes('CanonicalHotel')) {
        total += await repairTable(db, 'CanonicalHotel', ['name', 'normalizedName', 'city', 'countryName'], 'id', 'CanonicalHotel');
      }
      if (tableNames.includes('SupportedHotelDestination')) {
        total += await repairTable(db, 'SupportedHotelDestination', ['name', 'normalizedName', 'cityName', 'countryName'], 'id', 'SupportedHotelDestination');
      }
      if (tableNames.includes('HotelProviderMapping')) {
        total += await repairTable(db, 'HotelProviderMapping', ['name', 'normalizedName'], 'id', 'HotelProviderMapping');
      }
      if (tableNames.includes('HotelStaticContent')) {
        total += await repairTable(db, 'HotelStaticContent', ['name', 'normalizedName', 'city', 'countryName', 'supplierHotelCode'], 'id', 'HotelStaticContent');
      }
      await db.close();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[FIX] Error on ${url}: ${e}`);
      await db.close();
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\n[FIX] Total rows updated across all DBs: ${total}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[FATAL]', e);
  process.exit(1);
});
