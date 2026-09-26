import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { PrismaService } from '../shared/database/prisma.service';

function randomDate(fromDaysAgo: number, toDaysAgo: number): Date {
  const now = Date.now();
  const from = now - fromDaysAgo * 24 * 60 * 60 * 1000;
  const to = now - toDaysAgo * 24 * 60 * 60 * 1000;
  return new Date(to + Math.random() * (from - to));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randAmount(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

const GATEWAYS = ['STRIPE', 'PAYPAL'];
const CURRENCIES = ['USD', 'EUR', 'GBP'];

// Realistic route pairs (from, to) so the Top Destinations widget shows real
// city pairs instead of a generic "Flight" bucket.
const ROUTES: Array<{ from: string; to: string }> = [
  { from: 'LHE', to: 'DXB' }, { from: 'DXB', to: 'LHE' }, { from: 'KHI', to: 'JED' },
  { from: 'JED', to: 'KHI' }, { from: 'ISB', to: 'LHR' }, { from: 'LHR', to: 'ISB' },
  { from: 'LAH', to: 'IST' }, { from: 'IST', to: 'LAH' }, { from: 'LHE', to: 'LHR' },
  { from: 'LHR', to: 'LHE' }, { from: 'KHI', to: 'DXB' }, { from: 'DXB', to: 'KHI' },
  { from: 'ISB', to: 'DXB' }, { from: 'DXB', to: 'ISB' }, { from: 'LHE', to: 'JED' },
  { from: 'JED', to: 'LHE' }, { from: 'MUX', to: 'DXB' }, { from: 'DXB', to: 'MUX' },
  { from: 'LHE', to: 'SAW' }, { from: 'SAW', to: 'LHE' }, { from: 'KHI', to: 'LHR' },
  { from: 'LHR', to: 'KHI' }, { from: 'ISB', to: 'IST' }, { from: 'IST', to: 'ISB' },
];

const HOTELS = [
  { name: 'Grand Hotel', city: 'Dubai' }, { name: 'Seaside Resort', city: 'Maldives' },
  { name: 'Mountain Lodge', city: 'Islamabad' }, { name: 'City Inn', city: 'Karachi' },
  { name: 'Beach View', city: 'Phuket' }, { name: 'Sunset Hotel', city: 'Istanbul' },
  { name: 'Royal Palm', city: 'Lahore' }, { name: 'Ocean Breeze', city: 'Jeddah' },
  { name: 'Golden Sands', city: 'Sharjah' }, { name: 'Skyline Tower', city: 'Riyadh' },
  { name: 'Pearl Marina', city: 'Abu Dhabi' }, { name: 'Alpine Retreat', city: 'Skardu' },
];

function pickRoute() {
  return pick(ROUTES);
}

function pickHotel() {
  return pick(HOTELS);
}

function paymentWeightedStatus(): string {
  const r = Math.random();
  if (r < 0.5) return 'PAID';
  if (r < 0.68) return 'PENDING';
  if (r < 0.78) return 'FAILED';
  if (r < 0.87) return 'CANCELLED';
  if (r < 0.94) return 'REFUNDED';
  if (r < 0.98) return 'REQUIRES_ACTION';
  return 'AUTHORIZED';
}

function generateReference(): string {
  const prefix = pick(['TXN', 'PAY', 'INV']);
  const num = String(randInt(100000, 999999));
  return `${prefix}-${num}`;
}

function generateClientReference(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let ref = 'CR-';
  for (let i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);

    console.log('Seeding dashboard data...\n');

    // ── 1. Users ──
    console.log('Creating users...');
    const passwordHash = await bcrypt.hash('password123', 12);

    const userIds: string[] = (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);
    const existingCount = userIds.length;

    for (let i = existingCount; i < 50; i++) {
      const user = await prisma.user.upsert({
        where: { email: `customer${i + 1}@example.com` },
        update: {},
        create: {
          email: `customer${i + 1}@example.com`,
          passwordHash,
          firstName: pick(['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack']),
          lastName: pick(['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Wilson']),
          userType: 'CUSTOMER',
          status: Math.random() > 0.1 ? 'ACTIVE' : 'INACTIVE',
          createdAt: randomDate(90, 1),
        },
      });
      if (!userIds.includes(user.id)) userIds.push(user.id);
    }
    console.log(`  Users available: ${userIds.length}`);

    // ── 2. Flight Bookings ──
    console.log('Creating flight bookings...');
    const flightBookingIds: string[] = [];
    const flightBookedIds: string[] = [];

    for (let i = 0; i < 100; i++) {
      const createdAt = randomDate(360, 0);
      const isBooked = Math.random() < 0.6;
      const status = isBooked ? 'booked' : pick(['failed', 'pending_payment', 'booking_in_progress']);
      const amount = randAmount(150, 1800);
      const route = pickRoute();

      const booking = await prisma.flightBooking.create({
        data: {
          provider: pick(['travelport', 'amadeus', 'duffel']),
          status,
          offerSnapshot: {
            from: route.from,
            to: route.to,
            route: `${route.from} → ${route.to}`,
            origin: route.from,
            destination: route.to,
            departureDate: createdAt.toISOString().slice(0, 10),
            airline: pick(['PK', 'EK', 'QR', 'TK', 'BA', 'SV']),
          },
          travelerSnapshot: {
            passengers: [{ firstName: pick(['Ali', 'Sara', 'Omar', 'Ayesha', 'Hassan', 'Fatima']), lastName: pick(['Khan', 'Ahmed', 'Hussain', 'Malik', 'Butt']) }],
          },
          amount,
          currency: pick(CURRENCIES),
          userId: pick(userIds),
          createdAt,
          updatedAt: createdAt,
          ...(isBooked ? {
            locatorCode: pick(['ABC123', 'DEF456', 'GHI789', 'JKL012', 'MNO345', 'PQR678', 'STU901', 'VWX234']),
            message: 'Booking completed successfully',
          } : {}),
        },
      });
      flightBookingIds.push(booking.id);
      if (isBooked) flightBookedIds.push(booking.id);
    }
    console.log(`  Created ${flightBookingIds.length} flight bookings (${flightBookedIds.length} booked)`);

    // ── 3. Hotel Bookings ──
    console.log('Creating hotel bookings...');
    const hotelBookingIds: string[] = [];
    const hotelBookedIds: string[] = [];

    for (let i = 0; i < 80; i++) {
      const createdAt = randomDate(360, 0);
      const isBooked = Math.random() < 0.55;
      const status = isBooked ? 'booked' : pick(['failed', 'pending_payment', 'booking_in_progress']);
      const amount = randAmount(200, 2500);
      const hotel = pickHotel();

      const booking = await prisma.hotelBooking.create({
        data: {
          provider: pick(['hotelbeds', 'ratehawk', 'amadeus']),
          status,
          rateKey: `RT-${generateClientReference()}`,
          holder: { name: 'Test Holder' },
          clientReference: generateClientReference(),
          paxes: [{ type: 'ADULT', age: 30 }],
          amount,
          currency: pick(CURRENCIES),
          userId: pick(userIds),
          createdAt,
          updatedAt: createdAt,
          ...(isBooked ? {
            hotelbedsRef: `HB-${String(randInt(1000000, 9999999))}`,
            hotelbedsStatus: 'CONFIRMED',
            hotelSnapshot: {
              name: hotel.name,
              city: hotel.city,
              stars: randInt(3, 5),
              rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
            },
          } : {}),
        },
      });
      hotelBookingIds.push(booking.id);
      if (isBooked) hotelBookedIds.push(booking.id);
    }
    console.log(`  Created ${hotelBookingIds.length} hotel bookings (${hotelBookedIds.length} booked)`);

    // ── 4. Payments ──
    console.log('Creating payments...');

    // Generate payments for flight bookings
    let paymentCount = 0;
    for (const id of flightBookingIds) {
      const numPayments = Math.random() < 0.2 ? 2 : 1; // some have retries
      for (let p = 0; p < numPayments; p++) {
        const createdAt = randomDate(355, 0);
        const booking = await prisma.flightBooking.findUnique({ where: { id }, select: { amount: true, currency: true, status: true } });
        if (!booking) continue;
        const status = p === 0 ? paymentWeightedStatus() : 'PAID';

        await prisma.payment.create({
          data: {
            reference: generateReference(),
            bookingId: id,
            bookingType: 'FLIGHT',
            gateway: pick(GATEWAYS),
            amount: booking.amount ?? randAmount(150, 1800),
            currency: booking.currency ?? 'USD',
            status: status as any,
            idempotencyKey: `idem-${id}-${p}`,
            createdAt,
            updatedAt: createdAt,
          },
        });
        paymentCount++;
      }
    }

    // Generate payments for hotel bookings
    for (const id of hotelBookingIds) {
      const numPayments = Math.random() < 0.2 ? 2 : 1;
      for (let p = 0; p < numPayments; p++) {
        const createdAt = randomDate(355, 0);
        const booking = await prisma.hotelBooking.findUnique({ where: { id }, select: { amount: true, currency: true, status: true } });
        if (!booking) continue;
        const status = p === 0 ? paymentWeightedStatus() : 'PAID';

        await prisma.payment.create({
          data: {
            reference: generateReference(),
            bookingId: id,
            bookingType: 'HOTEL',
            gateway: pick(GATEWAYS),
            amount: booking.amount ?? randAmount(200, 2500),
            currency: booking.currency ?? 'USD',
            status: status as any,
            idempotencyKey: `idem-${id}-${p}`,
            createdAt,
            updatedAt: createdAt,
          },
        });
        paymentCount++;
      }
    }

    console.log(`  Created ${paymentCount} payments`);

    // ── Summary ──
    const summary = await prisma.payment.groupBy({
      by: ['status'],
      _count: { id: true },
      _sum: { amount: true },
    });

    console.log('\n── Dashboard Seed Summary ──');
    console.log(`  Users:         ${userIds.length}`);
    console.log(`  Flight Bookings: ${flightBookingIds.length}`);
    console.log(`  Hotel Bookings:  ${hotelBookingIds.length}`);
    console.log(`  Payments:        ${paymentCount}`);
    console.log('\n  Payment Breakdown:');
    for (const row of summary) {
      console.log(`    ${row.status}: ${row._count.id} ($${(row._sum.amount ?? 0).toFixed(2)})`);
    }
    console.log('\nSeed complete!');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
