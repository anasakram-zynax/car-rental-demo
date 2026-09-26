/**
 * GeoNames Import Script
 *
 * Downloads cities5000.zip from GeoNames and imports city data
 * into Destinations for the global destination search.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/import-geonames.ts
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GeonamesImportService } from '../modules/autocomplete/application/geonames-import.service';

async function main() {
  console.log('\n=== GeoNames City Import ===');
  console.log(`Started at: ${new Date().toISOString()}\n`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const importService = app.get(GeonamesImportService);
    const result = await importService.import();

    console.log('\n=== Import Results ===');
    console.log(`Total parsed: ${result.totalParsed}`);
    console.log(`Inserted:     ${result.inserted}`);
    console.log(`Updated:      ${result.updated}`);
    console.log(`Skipped:      ${result.skipped}`);

    if (result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`);
      for (const err of result.errors.slice(0, 10)) {
        console.log(`  - ${err.geonameId}: ${err.error}`);
      }
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more`);
      }
    }

    console.log(`\nCompleted at: ${new Date().toISOString()}`);
    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n=== Import Failed ===');
    console.error(error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main();
