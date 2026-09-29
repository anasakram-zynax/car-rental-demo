import 'dotenv/config';
import { PrismaService } from '../shared/database/prisma.service';
import { CarImageManifest, readCarImageManifest } from './import-car-images';

export const CAR_LOCATION_SEEDS = [
  [
    'lhe-city',
    'Lahore',
    'Lahore',
    'Lahore',
    'Punjab',
    'Pakistan',
    'city',
    null,
  ],
  [
    'airport-lhe-pakistan',
    'Allama Iqbal International Airport',
    'Allama Iqbal International Airport (LHE)',
    'Lahore',
    'Punjab',
    'Pakistan',
    'airport',
    'LHE',
  ],
  [
    'lhe-gulberg',
    'Gulberg',
    'Gulberg, Lahore',
    'Lahore',
    'Punjab',
    'Pakistan',
    'area',
    null,
  ],
  [
    'lhe-dha',
    'DHA Lahore',
    'DHA Lahore',
    'Lahore',
    'Punjab',
    'Pakistan',
    'area',
    null,
  ],
  [
    'lhe-bahria',
    'Bahria Town Lahore',
    'Bahria Town Lahore',
    'Lahore',
    'Punjab',
    'Pakistan',
    'area',
    null,
  ],
  [
    'isb-city',
    'Islamabad',
    'Islamabad',
    'Islamabad',
    'Islamabad Capital Territory',
    'Pakistan',
    'city',
    null,
  ],
  [
    'airport-isb-pakistan',
    'Islamabad International Airport',
    'Islamabad International Airport (ISB)',
    'Islamabad',
    'Islamabad Capital Territory',
    'Pakistan',
    'airport',
    'ISB',
  ],
  [
    'isb-blue-area',
    'Blue Area',
    'Blue Area, Islamabad',
    'Islamabad',
    'Islamabad Capital Territory',
    'Pakistan',
    'area',
    null,
  ],
  [
    'isb-f6-f7',
    'F-6 / F-7',
    'F-6 / F-7, Islamabad',
    'Islamabad',
    'Islamabad Capital Territory',
    'Pakistan',
    'area',
    null,
  ],
  [
    'rwp-city',
    'Rawalpindi',
    'Rawalpindi',
    'Rawalpindi',
    'Punjab',
    'Pakistan',
    'city',
    null,
  ],
] as const;

type Transmission = 'automatic' | 'manual';
export interface CarFleetSeed {
  assetSlug: string;
  displayName: string;
  brand: string;
  model: string;
  category: string;
  passengers: number;
  luggage: number;
  transmission: Transmission;
  quantity: number;
  rentalEnabled: boolean;
  transferEnabled: boolean;
  rentalPrice: number;
  locationIdentity: string;
  isActive: boolean;
}
const car = (
  assetSlug: string,
  displayName: string,
  brand: string,
  model: string,
  category: string,
  passengers: number,
  luggage: number,
  transmission: Transmission,
  quantity: number,
  rentalPrice: number,
  locationIdentity: string,
  transferEnabled = true,
): CarFleetSeed => ({
  assetSlug,
  displayName,
  brand,
  model,
  category,
  passengers,
  luggage,
  transmission,
  quantity,
  rentalEnabled: true,
  transferEnabled,
  rentalPrice,
  locationIdentity,
  isActive: true,
});

export const CAR_FLEET_SEEDS: readonly CarFleetSeed[] = [
  car(
    'audi-a6-2024',
    'Audi A6',
    'Audi',
    'A6',
    'luxury',
    5,
    4,
    'automatic',
    1,
    60000,
    'isb-f6-f7',
  ),
  car(
    'bmw-3-series-2024',
    'BMW 3 Series',
    'BMW',
    '3 Series',
    'luxury',
    5,
    3,
    'automatic',
    1,
    48000,
    'lhe-city',
  ),
  car(
    'bmw-5-series-2024',
    'BMW 5 Series',
    'BMW',
    '5 Series',
    'luxury',
    5,
    4,
    'automatic',
    1,
    58000,
    'airport-isb-pakistan',
  ),
  car(
    'changan-alsvin-2024',
    'Changan Alsvin',
    'Changan',
    'Alsvin',
    'sedan',
    5,
    3,
    'automatic',
    4,
    10500,
    'airport-lhe-pakistan',
  ),
  car(
    'haval-h6-2024',
    'Haval H6',
    'Haval',
    'H6',
    'suv',
    5,
    4,
    'automatic',
    2,
    24000,
    'lhe-dha',
  ),
  car(
    'honda-accord-2024',
    'Honda Accord',
    'Honda',
    'Accord',
    'luxury',
    5,
    4,
    'automatic',
    2,
    32000,
    'isb-city',
  ),
  car(
    'honda-br-v-2024',
    'Honda BR-V',
    'Honda',
    'BR-V',
    'suv',
    7,
    4,
    'automatic',
    3,
    18000,
    'airport-isb-pakistan',
  ),
  car(
    'honda-city-2024',
    'Honda City',
    'Honda',
    'City',
    'sedan',
    5,
    3,
    'automatic',
    5,
    12000,
    'isb-city',
  ),
  car(
    'honda-civic-2024',
    'Honda Civic',
    'Honda',
    'Civic',
    'standard',
    5,
    3,
    'automatic',
    3,
    14500,
    'lhe-city',
  ),
  car(
    'hyundai-elantra-2024',
    'Hyundai Elantra',
    'Hyundai',
    'Elantra',
    'standard',
    5,
    3,
    'automatic',
    3,
    15500,
    'lhe-city',
  ),
  car(
    'hyundai-tucson-2024',
    'Hyundai Tucson',
    'Hyundai',
    'Tucson',
    'suv',
    5,
    4,
    'automatic',
    2,
    19500,
    'isb-city',
  ),
  car(
    'kia-picanto-2024',
    'Kia Picanto',
    'Kia',
    'Picanto',
    'compact',
    4,
    2,
    'automatic',
    5,
    8500,
    'rwp-city',
    false,
  ),
  car(
    'kia-sportage-2024',
    'Kia Sportage',
    'Kia',
    'Sportage',
    'suv',
    5,
    4,
    'automatic',
    3,
    18500,
    'airport-isb-pakistan',
  ),
  car(
    'lexus-es-2024',
    'Lexus ES',
    'Lexus',
    'ES',
    'luxury',
    5,
    4,
    'automatic',
    1,
    65000,
    'airport-lhe-pakistan',
  ),
  car(
    'mercedes-c-class-2024',
    'Mercedes C-Class',
    'Mercedes-Benz',
    'C-Class',
    'luxury',
    5,
    3,
    'automatic',
    1,
    50000,
    'isb-city',
  ),
  car(
    'mercedes-e-class-2024',
    'Mercedes E-Class',
    'Mercedes-Benz',
    'E-Class',
    'luxury',
    5,
    4,
    'automatic',
    1,
    55000,
    'airport-lhe-pakistan',
  ),
  car(
    'mg-hs-2024',
    'MG HS',
    'MG',
    'HS',
    'suv',
    5,
    4,
    'automatic',
    2,
    23000,
    'isb-city',
  ),
  car(
    'range-rover-sport-2024',
    'Range Rover Sport',
    'Range Rover',
    'Sport',
    'luxury-suv',
    5,
    5,
    'automatic',
    1,
    85000,
    'lhe-dha',
  ),
  car(
    'suzuki-alto-2024',
    'Suzuki Alto',
    'Suzuki',
    'Alto',
    'economy',
    4,
    1,
    'manual',
    8,
    6000,
    'lhe-city',
    false,
  ),
  car(
    'suzuki-cultus-2023',
    'Suzuki Cultus',
    'Suzuki',
    'Cultus',
    'compact',
    5,
    2,
    'manual',
    5,
    8000,
    'airport-isb-pakistan',
  ),
  car(
    'suzuki-swift-2024',
    'Suzuki Swift',
    'Suzuki',
    'Swift',
    'compact',
    5,
    2,
    'automatic',
    6,
    8500,
    'airport-lhe-pakistan',
  ),
  car(
    'toyota-camry-2023',
    'Toyota Camry',
    'Toyota',
    'Camry',
    'luxury',
    5,
    4,
    'automatic',
    2,
    26000,
    'airport-lhe-pakistan',
  ),
  car(
    'toyota-corolla-2025',
    'Toyota Corolla',
    'Toyota',
    'Corolla',
    'standard',
    5,
    3,
    'automatic',
    7,
    11000,
    'airport-lhe-pakistan',
  ),
  car(
    'toyota-corolla-cross-2024',
    'Toyota Corolla Cross',
    'Toyota',
    'Corolla Cross',
    'suv',
    5,
    4,
    'automatic',
    3,
    22000,
    'isb-city',
  ),
  car(
    'toyota-fortuner-2025',
    'Toyota Fortuner',
    'Toyota',
    'Fortuner',
    'luxury-suv',
    7,
    5,
    'automatic',
    2,
    27000,
    'airport-isb-pakistan',
  ),
  car(
    'toyota-innova-2023',
    'Toyota Innova',
    'Toyota',
    'Innova',
    'people-carrier',
    8,
    6,
    'manual',
    2,
    24000,
    'airport-lhe-pakistan',
  ),
  car(
    'toyota-land-cruiser-2024',
    'Toyota Land Cruiser',
    'Toyota',
    'Land Cruiser',
    'luxury-suv',
    7,
    5,
    'automatic',
    1,
    50000,
    'airport-isb-pakistan',
  ),
  car(
    'toyota-prado-2024',
    'Toyota Prado',
    'Toyota',
    'Prado',
    'luxury-suv',
    7,
    5,
    'automatic',
    2,
    38000,
    'airport-lhe-pakistan',
  ),
  car(
    'toyota-vitz-2020',
    'Toyota Vitz',
    'Toyota',
    'Vitz',
    'economy',
    5,
    2,
    'automatic',
    4,
    7500,
    'rwp-city',
    false,
  ),
  car(
    'toyota-yaris-2024',
    'Toyota Yaris',
    'Toyota',
    'Yaris',
    'sedan',
    5,
    2,
    'automatic',
    5,
    9500,
    'airport-lhe-pakistan',
  ),
];

export const CAR_TRANSFER_PACKAGE_SEEDS = [
  ['Toyota Corolla', 'airport-lhe-pakistan', 'lhe-gulberg', 4500],
  ['Toyota Corolla', 'airport-lhe-pakistan', 'lhe-dha', 5200],
  ['Toyota Corolla', 'airport-lhe-pakistan', 'lhe-bahria', 7500],
  ['Toyota Yaris', 'airport-lhe-pakistan', 'lhe-gulberg', 4000],
  ['Toyota Yaris', 'airport-lhe-pakistan', 'lhe-dha', 4800],
  ['Toyota Innova', 'airport-lhe-pakistan', 'lhe-bahria', 12000],
  ['Kia Sportage', 'airport-isb-pakistan', 'isb-city', 6000],
  ['Kia Sportage', 'airport-isb-pakistan', 'isb-blue-area', 6500],
  ['Toyota Fortuner', 'airport-isb-pakistan', 'isb-f6-f7', 8500],
  ['Toyota Fortuner', 'airport-isb-pakistan', 'rwp-city', 9000],
  ['Changan Alsvin', 'airport-lhe-pakistan', 'lhe-gulberg', 4200],
  ['Changan Alsvin', 'airport-lhe-pakistan', 'lhe-dha', 5000],
  ['Toyota Camry', 'airport-lhe-pakistan', 'lhe-gulberg', 7500],
  ['Toyota Camry', 'airport-lhe-pakistan', 'lhe-bahria', 11000],
  ['Toyota Prado', 'airport-lhe-pakistan', 'lhe-gulberg', 11000],
  ['Toyota Prado', 'airport-lhe-pakistan', 'lhe-bahria', 16000],
  ['Mercedes E-Class', 'airport-lhe-pakistan', 'lhe-gulberg', 14000],
  ['Lexus ES', 'airport-lhe-pakistan', 'lhe-dha', 14500],
  ['Toyota Innova', 'airport-lhe-pakistan', 'lhe-dha', 12000],
  ['Suzuki Cultus', 'airport-isb-pakistan', 'isb-blue-area', 4500],
  ['Honda BR-V', 'airport-isb-pakistan', 'isb-city', 6500],
  ['Honda BR-V', 'airport-isb-pakistan', 'rwp-city', 7500],
  ['Toyota Land Cruiser', 'airport-isb-pakistan', 'isb-f6-f7', 14000],
  ['Toyota Land Cruiser', 'airport-isb-pakistan', 'isb-blue-area', 15000],
  ['BMW 5 Series', 'airport-isb-pakistan', 'isb-city', 15000],
] as const;

const normalize = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();
function validateManifest(manifest: CarImageManifest) {
  for (const fleet of CAR_FLEET_SEEDS) {
    const images = manifest.cars[fleet.assetSlug]?.images;
    if (!images?.length)
      throw new Error(
        `No imported images found for ${fleet.assetSlug}. Run npm run import:car-images first.`,
      );
    if (images[0].order !== 0 || !images[0].isDefault)
      throw new Error(`Invalid default image metadata for ${fleet.assetSlug}.`);
  }
}

export async function seedCars(
  prisma: PrismaService,
  manifest: CarImageManifest,
) {
  validateManifest(manifest);
  const locations = new Map<string, { id: string }>();
  for (const [
    identity,
    name,
    label,
    city,
    region,
    country,
    type,
    code,
  ] of CAR_LOCATION_SEEDS) {
    const location = await prisma.carLocation.upsert({
      where: { identity },
      create: { identity, name, label, city, region, country, type, code },
      update: { name, label, city, region, country, type, code },
    });
    locations.set(identity, location);
  }
  const fleets = new Map<string, { id: string }>();
  for (const source of CAR_FLEET_SEEDS) {
    const locationId = locations.get(source.locationIdentity)!.id;
    const normalizedDisplayName = normalize(source.displayName);
    const images = manifest.cars[source.assetSlug].images.map(
      ({ url, order, isDefault }) => ({ url, order, isDefault }),
    );
    const data = {
      displayName: source.displayName,
      normalizedDisplayName,
      brand: source.brand,
      model: source.model,
      category: source.category,
      passengerCapacity: source.passengers,
      luggageCapacity: source.luggage,
      transmission: source.transmission,
      quantity: source.quantity,
      rentalEnabled: source.rentalEnabled,
      transferEnabled: source.transferEnabled,
      rentalPrice: source.rentalPrice,
      currency: 'PKR',
      locationId,
      images,
      isActive: source.isActive,
    };
    const saved = await prisma.carFleet.upsert({
      where: {
        normalizedDisplayName_locationId: { normalizedDisplayName, locationId },
      },
      create: data,
      update: data,
    });
    fleets.set(source.displayName, saved);
  }
  for (const [
    fleetName,
    pickupIdentity,
    dropoffIdentity,
    price,
  ] of CAR_TRANSFER_PACKAGE_SEEDS) {
    const fleetId = fleets.get(fleetName)?.id;
    if (!fleetId)
      throw new Error(
        `Transfer package references unknown fleet: ${fleetName}.`,
      );
    const pickupLocationId = locations.get(pickupIdentity)!.id;
    const dropoffLocationId = locations.get(dropoffIdentity)!.id;
    await prisma.carTransferPackage.upsert({
      where: {
        fleetId_pickupLocationId_dropoffLocationId: {
          fleetId,
          pickupLocationId,
          dropoffLocationId,
        },
      },
      create: {
        fleetId,
        pickupLocationId,
        dropoffLocationId,
        price,
        currency: 'PKR',
        isActive: true,
      },
      update: { price, currency: 'PKR', isActive: true },
    });
  }
  return {
    locations: CAR_LOCATION_SEEDS.length,
    fleets: CAR_FLEET_SEEDS.length,
    transferPackages: CAR_TRANSFER_PACKAGE_SEEDS.length,
  };
}

async function main() {
  const prisma = new PrismaService();
  try {
    const manifest = await readCarImageManifest();
    await prisma.$connect();
    const result = await seedCars(prisma, manifest);
    console.log(
      `Cars seed complete: ${result.locations} locations, ${result.fleets} fleets, ${result.transferPackages} transfer packages.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
if (require.main === module)
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
