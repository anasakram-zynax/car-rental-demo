import 'dotenv/config';
import { PrismaClient } from '../src/generated';
import { PrismaPg } from '@prisma/adapter-pg';

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const connUrlString = process.env.DATABASE_DIRECT_URL || rawUrl;
const url = new URL(connUrlString);
url.searchParams.set('sslmode', 'no-verify');

const adapter = new PrismaPg({
  connectionString: url.toString(),
  max: 1,
});

const prisma = new PrismaClient({ adapter });

const PLACEHOLDER_IMAGE =
  'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';

interface SeedHotel {
  name: string;
  location: string;
  destinationCode: string;
  destinationName: string;
  stars: number;
  rating: number;
  priceFrom: number;
  discount: number | null;
  slug: string;
  hotelOrder: number;
}

const seedHotels: SeedHotel[] = [
  {
    name: 'Atlantis The Palm', location: 'Palm Jumeirah, Dubai',
    destinationCode: 'DXB', destinationName: 'Dubai',
    stars: 5, rating: 4.8, priceFrom: 450, discount: 15,
    slug: 'atlantis-the-palm', hotelOrder: 1,
  },
  {
    name: 'The Ritz-Carlton New York', location: 'Central Park, New York',
    destinationCode: 'JFK', destinationName: 'New York',
    stars: 5, rating: 4.9, priceFrom: 680, discount: null,
    slug: 'ritz-carlton-new-york', hotelOrder: 2,
  },
  {
    name: 'W Barcelona', location: 'Barceloneta, Barcelona',
    destinationCode: 'BCN', destinationName: 'Barcelona',
    stars: 5, rating: 4.7, priceFrom: 320, discount: 10,
    slug: 'w-barcelona', hotelOrder: 3,
  },
  {
    name: 'Park Hyatt Tokyo', location: 'Shinjuku, Tokyo',
    destinationCode: 'NRT', destinationName: 'Tokyo',
    stars: 5, rating: 4.9, priceFrom: 520, discount: null,
    slug: 'park-hyatt-tokyo', hotelOrder: 4,
  },
  {
    name: 'The St. Regis Maldives', location: 'Dhaalu Atoll, Maldives',
    destinationCode: 'MLE', destinationName: 'Malé',
    stars: 5, rating: 4.9, priceFrom: 890, discount: 20,
    slug: 'st-regis-maldives', hotelOrder: 5,
  },
  {
    name: 'AYANA Resort Bali', location: 'Jimbaran, Bali',
    destinationCode: 'DPS', destinationName: 'Denpasar',
    stars: 5, rating: 4.7, priceFrom: 210, discount: 12,
    slug: 'ayana-resort-bali', hotelOrder: 6,
  },
];

async function main() {
  console.log('Seeding manual featured hotels...');

  for (const h of seedHotels) {
    const existing = await prisma.manualHotel.findUnique({ where: { slug: h.slug } });
    if (existing) {
      console.log(`  SKIP: ${h.name} (already exists)`);
      continue;
    }

    await prisma.manualHotel.create({
      data: {
        name: h.name,
        slug: h.slug,
        status: 'active',
        featured: true,
        hotelOrder: h.hotelOrder,
        stars: h.stars,
        rating: h.rating,
        accommodationType: 'Hotel',
        currency: 'USD',
        discount: h.discount,
        checkinTime: '14:00',
        checkoutTime: '12:00',
        location: h.location,
        destinationCode: h.destinationCode,
        destinationName: h.destinationName,
        images: [{ url: PLACEHOLDER_IMAGE, isDefault: true }],
        amenities: ['wifi', 'pool', 'parking'],
        translations: {},
        rooms: {
          create: {
            name: 'Standard Room',
            basePrice: h.priceFrom,
            currency: 'USD',
            maxAdults: 2,
            availableQuantity: 10,
            boardType: 'Bed & Breakfast',
            amenities: ['ac', 'tv', 'wifi'],
            images: [{ url: PLACEHOLDER_IMAGE }],
            translations: {},
          },
        },
      },
    });

    console.log(`  CREATED: ${h.name}`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', (e as Error).message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
