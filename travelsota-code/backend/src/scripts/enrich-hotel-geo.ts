/**
 * Enrich SupplierDestinations with geolocation from Geonames data.
 *
 * Cross-references SupplierDestinations (Hotelbeds IATA destinations) with
 * Destinations (gn-* entries from cities5000 import).
 * Matches by exact normalized name + country code.
 *
 * Usage:
 *   npm run enrich:hotel-geo
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../shared/database/prisma.service';

const BATCH_SIZE = 500;

interface GeoEntry {
  name: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

async function main() {
  console.log('\n=== SupplierDestinations Geolocation Enrichment ===\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);

    // 1. Load all GN entries with lat/lng into memory
    console.log('Loading geonames entries...');
    const gnRows = await prisma.destinations.findMany({
      where: { code: { startsWith: 'gn-' }, latitude: { not: null } },
      select: { normalizedName: true, name: true, countryCode: true, latitude: true, longitude: true },
    });
    console.log(`  Loaded ${gnRows.length} geonames entries`);

    // Build lookup map: key = normalizedName|countryCode
    const geoMap = new Map<string, GeoEntry>();
    for (const gn of gnRows) {
      if (!gn.normalizedName || !gn.countryCode) continue;
      const key = `${gn.normalizedName}|${gn.countryCode}`;
      // first match wins (typically the most populous city)
      if (!geoMap.has(key)) {
        geoMap.set(key, {
          name: gn.name,
          countryCode: gn.countryCode,
          latitude: gn.latitude!,
          longitude: gn.longitude!,
        });
      }
    }
    console.log(`  Unique geo keys: ${geoMap.size}\n`);

    // 2. Load all Hotelbeds destinations needing geo
    const hbDests = await prisma.supplierDestinations.findMany({
      where: { provider: 'hotelbeds', latitude: null },
      select: { id: true, providerCode: true, name: true, countryCode: true },
      orderBy: { name: 'asc' },
    });
    console.log(`Hotelbeds destinations without geo: ${hbDests.length}`);

    let matched = 0;
    let unmatched = 0;
    const updates: Array<{ id: string; latitude: number; longitude: number }> = [];

    for (const hb of hbDests) {
      const normalizedName = hb.name.toLowerCase().trim();
      const countryCode = (hb.countryCode ?? '').trim();
      const key = `${normalizedName}|${countryCode}`;

      const geo = geoMap.get(key);
      if (geo) {
        updates.push({ id: hb.id, latitude: geo.latitude, longitude: geo.longitude });
        matched++;
      } else {
        unmatched++;
      }
    }

    console.log(`  Matched  : ${matched}`);
    console.log(`  Unmatched: ${unmatched}\n`);

    // 3. Batch update
    if (updates.length > 0) {
      console.log(`Updating ${updates.length} destinations...`);

      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        // Build raw SQL for batch update via CASE
        const ids = batch.map((u) => `'${u.id}'`).join(',');
        const latCase = batch.map((u) => `WHEN id = '${u.id}' THEN ${u.latitude}`).join(' ');
        const lngCase = batch.map((u) => `WHEN id = '${u.id}' THEN ${u.longitude}`).join(' ');

        await prisma.$executeRawUnsafe(
          `UPDATE hotel_content."SupplierDestinations" SET latitude = CASE ${latCase} END, longitude = CASE ${lngCase} END WHERE id IN (${ids})`,
        );

        const progress = Math.min(i + BATCH_SIZE, updates.length);
        console.log(`  [${progress}/${updates.length}]`);
      }

      console.log('\nUpdate complete.');
    }

    // 4. Show final stats
    const totalWithGeo = await prisma.supplierDestinations.count({
      where: { provider: 'hotelbeds', latitude: { not: null } },
    });
    const totalAll = await prisma.supplierDestinations.count({
      where: { provider: 'hotelbeds' },
    });
    console.log(`\n=== Done ===`);
    console.log(`Total destinations : ${totalAll}`);
    console.log(`With geolocation  : ${totalWithGeo}`);
    console.log(`Coverage          : ${((totalWithGeo / totalAll) * 100).toFixed(1)}%`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Enrichment failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
