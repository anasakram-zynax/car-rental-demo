import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../shared/database/prisma.service';

interface LanguageSeed {
  code: string;
  name: string;
  direction: string;
  isDefault?: boolean;
}

const SEED_LANGUAGES: LanguageSeed[] = [
  { code: 'en', name: 'English', direction: 'LTR', isDefault: true },
  { code: 'ar', name: 'Arabic', direction: 'RTL' },
  { code: 'fr', name: 'French', direction: 'LTR' },
  { code: 'tr', name: 'Turkish', direction: 'LTR' },
  { code: 'ur', name: 'Urdu', direction: 'RTL' },
];

async function main() {
  console.log('\n=== Language Seed ===\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);

    for (const seed of SEED_LANGUAGES) {
      const existing = await prisma.language.findUnique({
        where: { code: seed.code },
      });

      if (existing) {
        console.log(`  ${seed.code}: already exists — updating`);
        await prisma.language.update({
          where: { code: seed.code },
          data: {
            name: seed.name,
            direction: seed.direction,
            isActive: true,
          },
        });
      } else {
        console.log(`  ${seed.code}: creating`);
        await prisma.language.create({
          data: {
            code: seed.code,
            name: seed.name,
            direction: seed.direction,
            isDefault: seed.isDefault ?? false,
            isActive: true,
          },
        });
      }
    }

    const defaultCount = await prisma.language.count({ where: { isDefault: true } });
    if (defaultCount === 0) {
      const fallback = await prisma.language.findFirst({ where: { code: 'en' } });
      if (fallback) {
        await prisma.language.update({ where: { id: fallback.id }, data: { isDefault: true } });
        console.log('  en set as default (fallback)');
      }
    }

    const total = await prisma.language.count();
    console.log(`\n  ${total} languages seeded`);
    console.log('\n=== Language Seed Complete ===\n');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
