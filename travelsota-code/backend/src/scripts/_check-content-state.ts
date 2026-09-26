import 'dotenv/config';
import { PrismaService } from '../shared/database/prisma.service';

async function main() {
  const p = new PrismaService();
  await p.$connect();

  console.log('=== hotel_content schema tables ===\n');

  const staticContent = await p.hotelContent.count();
  console.log(`HotelContent: ${staticContent} rows`);

  const canonical = await p.hotels.count();
  console.log(`Hotels: ${canonical} rows`);

  const mappings = await p.hotelSupplierLinks.count();
  console.log(`HotelSupplierLinks: ${mappings} rows`);

  const regions = await p.supplierRegions.count();
  console.log(`SupplierRegions: ${regions} rows`);

  const destinations = await p.destinations.count();
  console.log(`Destinations: ${destinations} rows`);

  const destMappings = await p.destinationSupplierCodes.count();
  console.log(`DestinationSupplierCodes: ${destMappings} rows`);

  const syncJobs = await p.importJobs.count();
  console.log(`ImportJobs: ${syncJobs} rows`);

  // public schema
  console.log('\n=== public schema tables ===\n');
  const flightLocations = await p.flightLocation.count();
  console.log(`FlightLocation: ${flightLocations} rows`);

  // Provider breakdown
  if (staticContent > 0) {
    console.log('\n=== StaticContent by provider ===');
    const byProvider = await p.hotelContent.groupBy({
      by: ['provider'],
      _count: { id: true },
    });
    for (const row of byProvider) {
      console.log(`  ${row.provider}: ${row._count.id}`);
    }
  }

  if (mappings > 0) {
    console.log('\n=== ProviderMappings ===');
    const byProvider = await p.hotelSupplierLinks.groupBy({
      by: ['provider'],
      _count: { id: true },
    });
    for (const row of byProvider) {
      console.log(`  ${row.provider}: ${row._count.id}`);
    }
    const byMethod = await p.hotelSupplierLinks.groupBy({
      by: ['matchMethod'],
      _count: { id: true },
    });
    console.log('  By match method:');
    for (const row of byMethod) {
      console.log(`    ${row.matchMethod}: ${row._count.id}`);
    }
  }

  if (regions > 0) {
    console.log('\n=== RegionContent by type ===');
    const byType = await p.supplierRegions.groupBy({
      by: ['type'],
      _count: { id: true },
    });
    for (const row of byType) {
      console.log(`  ${row.type}: ${row._count.id}`);
    }
  }

  await p.$disconnect();
}
main();
