/**
 * DEBUG SCRIPT — delete ALL hotel content sync jobs (any status).
 * Clears ImportJobs + ImportJobItems from SQLite.
 * Used to clean up after import testing. DELETE THIS FILE after debugging.
 *
 * Usage:
 *   npx ts-node --transpile-only src/scripts/debug-clear-sync-jobs.ts
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../shared/database/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);

    const before = await prisma.importJobs.count();
    const itemsBefore = await prisma.importJobItems.count();
    console.log(`Jobs before: ${before}, Sync items before: ${itemsBefore}`);

    const deletedItems = await prisma.importJobItems.deleteMany({});
    const deletedJobs = await prisma.importJobs.deleteMany({});

    const after = await prisma.importJobs.count();
    console.log(`Deleted items: ${deletedItems.count}, Deleted jobs: ${deletedJobs.count}`);
    console.log(`Jobs after: ${after}`);

    // Content remains untouched — only job tracking rows removed
    const hotels = await prisma.hotelContent.count();
    const destinations = await prisma.destinations.count();
    console.log(`Content preserved — hotels: ${hotels}, destinations: ${destinations}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
