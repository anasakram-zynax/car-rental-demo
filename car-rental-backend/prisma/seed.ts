import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/shared/database/generated/prisma/client.js';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting database seed...');

  // -----------------------------
  // 1. Car Types
  // -----------------------------

  const sedan = await prisma.carType.upsert({
    where: { label: 'Sedan' },
    update: {},
    create: { label: 'Sedan' },
  });

  const suv = await prisma.carType.upsert({
    where: { label: 'SUV' },
    update: {},
    create: { label: 'SUV' },
  });

  const hatchback = await prisma.carType.upsert({
    where: { label: 'Hatchback' },
    update: {},
    create: { label: 'Hatchback' },
  });

  const luxury = await prisma.carType.upsert({
    where: { label: 'Luxury' },
    update: {},
    create: { label: 'Luxury' },
  });

  // -----------------------------
  // 2. Cars
  // -----------------------------

  const cars = [
    {
      name: 'Toyota Corolla 2025',
      slug: 'toyota-corolla-2025',
      brand: 'Toyota',
      model: 'Corolla',
      year: 2025,
      carTypeId: sedan.id,
      transmission: 'Automatic',
      fuelType: 'Petrol',
      doors: 4,
      passengers: 5,
      baggage: 2,
      amenities: ['Air Conditioning', 'Bluetooth', 'USB'],
      city: 'Lahore',
      dailyPrice: 50,
      currency: 'USD',
      isRefundable: true,
      featured: true,
      status: 'ACTIVE' as const,
      images: [
        {
          url: 'https://placehold.co/800x500?text=Toyota+Corolla',
          isDefault: true,
        },
      ],
    },

    {
      name: 'Honda Civic 2024',
      slug: 'honda-civic-2024',
      brand: 'Honda',
      model: 'Civic',
      year: 2024,
      carTypeId: sedan.id,
      transmission: 'Automatic',
      fuelType: 'Petrol',
      doors: 4,
      passengers: 5,
      baggage: 2,
      amenities: ['Air Conditioning', 'Bluetooth', 'Cruise Control'],
      city: 'Lahore',
      dailyPrice: 70,
      currency: 'USD',
      isRefundable: true,
      featured: false,
      status: 'ACTIVE' as const,
      images: [
        {
          url: 'https://placehold.co/800x500?text=Honda+Civic',
          isDefault: true,
        },
      ],
    },

    {
      name: 'Toyota Fortuner 2025',
      slug: 'toyota-fortuner-2025',
      brand: 'Toyota',
      model: 'Fortuner',
      year: 2025,
      carTypeId: suv.id,
      transmission: 'Automatic',
      fuelType: 'Diesel',
      doors: 5,
      passengers: 7,
      baggage: 4,
      amenities: [
        'Air Conditioning',
        'Bluetooth',
        'Cruise Control',
        'Rear Camera',
      ],
      city: 'Lahore',
      dailyPrice: 120,
      currency: 'USD',
      isRefundable: true,
      featured: true,
      status: 'ACTIVE' as const,
      images: [
        {
          url: 'https://placehold.co/800x500?text=Toyota+Fortuner',
          isDefault: true,
        },
      ],
    },

    {
      name: 'Kia Sportage 2024',
      slug: 'kia-sportage-2024',
      brand: 'Kia',
      model: 'Sportage',
      year: 2024,
      carTypeId: suv.id,
      transmission: 'Automatic',
      fuelType: 'Petrol',
      doors: 5,
      passengers: 5,
      baggage: 3,
      amenities: [
        'Air Conditioning',
        'Bluetooth',
        'Apple CarPlay',
        'Rear Camera',
      ],
      city: 'Islamabad',
      dailyPrice: 100,
      currency: 'USD',
      isRefundable: true,
      featured: true,
      status: 'ACTIVE' as const,
      images: [
        {
          url: 'https://placehold.co/800x500?text=Kia+Sportage',
          isDefault: true,
        },
      ],
    },

    {
      name: 'Suzuki Swift 2024',
      slug: 'suzuki-swift-2024',
      brand: 'Suzuki',
      model: 'Swift',
      year: 2024,
      carTypeId: hatchback.id,
      transmission: 'Automatic',
      fuelType: 'Petrol',
      doors: 5,
      passengers: 5,
      baggage: 2,
      amenities: ['Air Conditioning', 'Bluetooth', 'USB'],
      city: 'Lahore',
      dailyPrice: 40,
      currency: 'USD',
      isRefundable: true,
      featured: false,
      status: 'ACTIVE' as const,
      images: [
        {
          url: 'https://placehold.co/800x500?text=Suzuki+Swift',
          isDefault: true,
        },
      ],
    },

    {
      name: 'Mercedes C-Class 2024',
      slug: 'mercedes-c-class-2024',
      brand: 'Mercedes-Benz',
      model: 'C-Class',
      year: 2024,
      carTypeId: luxury.id,
      transmission: 'Automatic',
      fuelType: 'Petrol',
      doors: 4,
      passengers: 5,
      baggage: 3,
      amenities: [
        'Climate Control',
        'Leather Seats',
        'Bluetooth',
        'Cruise Control',
        'Rear Camera',
      ],
      city: 'Islamabad',
      dailyPrice: 180,
      currency: 'USD',
      isRefundable: true,
      featured: true,
      status: 'ACTIVE' as const,
      images: [
        {
          url: 'https://placehold.co/800x500?text=Mercedes+C-Class',
          isDefault: true,
        },
      ],
    },

    {
      name: 'Toyota Yaris 2024',
      slug: 'toyota-yaris-2024',
      brand: 'Toyota',
      model: 'Yaris',
      year: 2024,
      carTypeId: sedan.id,
      transmission: 'Automatic',
      fuelType: 'Petrol',
      doors: 4,
      passengers: 5,
      baggage: 2,
      amenities: ['Air Conditioning', 'Bluetooth', 'USB'],
      city: 'Karachi',
      dailyPrice: 55,
      currency: 'USD',
      isRefundable: true,
      featured: false,
      status: 'ACTIVE' as const,
      images: [
        {
          url: 'https://placehold.co/800x500?text=Toyota+Yaris',
          isDefault: true,
        },
      ],
    },

    {
      name: 'Range Rover Sport 2024',
      slug: 'range-rover-sport-2024',
      brand: 'Land Rover',
      model: 'Range Rover Sport',
      year: 2024,
      carTypeId: luxury.id,
      transmission: 'Automatic',
      fuelType: 'Petrol',
      doors: 5,
      passengers: 5,
      baggage: 4,
      amenities: [
        'Climate Control',
        'Leather Seats',
        'Panoramic Roof',
        'Bluetooth',
        '360 Camera',
      ],
      city: 'Lahore',
      dailyPrice: 250,
      currency: 'USD',
      isRefundable: true,
      featured: true,
      status: 'ACTIVE' as const,
      images: [
        {
          url: 'https://placehold.co/800x500?text=Range+Rover+Sport',
          isDefault: true,
        },
      ],
    },
  ];

  // -----------------------------
  // 3. Insert Cars
  // -----------------------------

  for (const carData of cars) {
    const { images, ...car } = carData;

    await prisma.car.upsert({
      where: {
        slug: car.slug,
      },

      update: {},

      create: {
        ...car,

        images: {
          create: images,
        },
      },
    });
  }

  console.log('Database seeded successfully.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
