import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../shared/database/prisma.service';

interface CommissionTierDef {
  name: string;
  description: string;
  commissionRate: number;
  flightCommissionRate: number;
  hotelCommissionRate: number;
  packageCommissionRate: number;
  minMonthlyBookings: number;
  isDefault?: boolean;
}

const COMMISSION_TIERS: CommissionTierDef[] = [
  {
    name: 'starter',
    description: 'New agents — standard commission rates with no monthly minimum',
    commissionRate: 3,
    flightCommissionRate: 2,
    hotelCommissionRate: 5,
    packageCommissionRate: 4,
    minMonthlyBookings: 0,
    isDefault: true,
  },
  {
    name: 'growth',
    description: 'Growing agents — higher commission rates, moderate monthly target',
    commissionRate: 5,
    flightCommissionRate: 3,
    hotelCommissionRate: 8,
    packageCommissionRate: 6,
    minMonthlyBookings: 20,
  },
  {
    name: 'premium',
    description: 'Top-performing agents — maximum commission rates, high monthly target',
    commissionRate: 8,
    flightCommissionRate: 5,
    hotelCommissionRate: 12,
    packageCommissionRate: 10,
    minMonthlyBookings: 50,
  },
  {
    name: 'corporate',
    description: 'Corporate travel agents — custom rates for corporate booking volumes',
    commissionRate: 6,
    flightCommissionRate: 4,
    hotelCommissionRate: 10,
    packageCommissionRate: 8,
    minMonthlyBookings: 100,
  },
];

async function seedCommissionTiers(prisma: PrismaService) {
  let count = 0;
  for (const tier of COMMISSION_TIERS) {
    await prisma.commissionTier.upsert({
      where: { name: tier.name },
      create: {
        name: tier.name,
        description: tier.description,
        commissionRate: tier.commissionRate,
        flightCommissionRate: tier.flightCommissionRate,
        hotelCommissionRate: tier.hotelCommissionRate,
        packageCommissionRate: tier.packageCommissionRate,
        minMonthlyBookings: tier.minMonthlyBookings,
        isDefault: tier.isDefault ?? false,
      },
      update: {
        description: tier.description,
        commissionRate: tier.commissionRate,
        flightCommissionRate: tier.flightCommissionRate,
        hotelCommissionRate: tier.hotelCommissionRate,
        packageCommissionRate: tier.packageCommissionRate,
        minMonthlyBookings: tier.minMonthlyBookings,
        isDefault: tier.isDefault ?? false,
      },
    });
    count++;
  }
  console.log(`  ${count} commission tiers upserted`);
}

async function main() {
  console.log('\n=== Agent Commission Tiers Seed ===\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);

    console.log('Seeding commission tiers...');
    await seedCommissionTiers(prisma);

    console.log('\n=== Agent Commission Tiers Seed Complete ===\n');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
