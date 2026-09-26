import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../shared/database/prisma.service';

interface CurrencySeed {
  code: string;
  symbol: string;
  name: string;
  exchangeRate: number;
  decimals: number;
  isBase?: boolean;
  isDefault?: boolean;
}

const SEED_CURRENCIES: CurrencySeed[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', exchangeRate: 1, decimals: 2, isBase: true },
  { code: 'EUR', symbol: '€', name: 'Euro', exchangeRate: 0.92, decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', exchangeRate: 0.79, decimals: 2 },
  { code: 'KWD', symbol: 'KD', name: 'Kuwaiti Dinar', exchangeRate: 0.31, decimals: 3 },
  { code: 'BHD', symbol: 'BD', name: 'Bahraini Dinar', exchangeRate: 0.38, decimals: 3 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', exchangeRate: 3.67, decimals: 2 },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', exchangeRate: 3.75, decimals: 2, isDefault: true },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', exchangeRate: 157, decimals: 0 },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', exchangeRate: 7.24, decimals: 2 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', exchangeRate: 83.5, decimals: 2 },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee', exchangeRate: 278, decimals: 2 },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', exchangeRate: 32.4, decimals: 2 },
];

async function main() {
  console.log('\n=== Currency Seed ===\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);

    for (const seed of SEED_CURRENCIES) {
      const existing = await prisma.currency.findUnique({
        where: { code: seed.code },
      });

      if (existing) {
        console.log(`  ${seed.code}: already exists — updating rate`);
        await prisma.currency.update({
          where: { code: seed.code },
          data: {
            symbol: seed.symbol,
            name: seed.name,
            exchangeRate: seed.exchangeRate,
            decimals: seed.decimals,
            isActive: true,
          },
        });
      } else {
        console.log(`  ${seed.code}: creating`);
        await prisma.currency.create({
          data: {
            code: seed.code,
            symbol: seed.symbol,
            name: seed.name,
            exchangeRate: seed.exchangeRate,
            decimals: seed.decimals,
            isBase: seed.isBase ?? false,
            isDefault: seed.isDefault ?? false,
            isActive: true,
          },
        });
      }
    }

    // Ensure only one currency has isBase and isDefault
    const baseCount = await prisma.currency.count({ where: { isBase: true } });
    const defaultCount = await prisma.currency.count({ where: { isDefault: true } });

    if (baseCount === 0) {
      const fallback = await prisma.currency.findFirst({ where: { code: 'USD' } });
      if (fallback) {
        await prisma.currency.update({ where: { id: fallback.id }, data: { isBase: true } });
        console.log('  USD set as base (fallback)');
      }
    }

    if (defaultCount === 0) {
      const fallback = await prisma.currency.findFirst({ where: { code: 'SAR' } });
      if (fallback) {
        await prisma.currency.update({ where: { id: fallback.id }, data: { isDefault: true } });
        console.log('  SAR set as default (fallback)');
      }
    }

    const total = await prisma.currency.count();
    console.log(`\n  ${total} currencies seeded`);
    console.log('\n=== Currency Seed Complete ===\n');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
