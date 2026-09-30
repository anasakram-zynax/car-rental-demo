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
    190,
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
    150,
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
    180,
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
    42,
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
    85,
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
    110,
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
    70,
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
    48,
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
    58,
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
    62,
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
    78,
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
    32,
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
    75,
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
    210,
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
    175,
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
    200,
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
    82,
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
    280,
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
    25,
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
    30,
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
    35,
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
    95,
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
    45,
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
    80,
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
    110,
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
    90,
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
    220,
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
    140,
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
    28,
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
    38,
    'airport-lhe-pakistan',
  ),
];

export const CAR_FLEET_CONTENT: Record<
  string,
  { description: string; amenities: string[] }
> = {
  'audi-a6-2024': {
    description:
      'Audi A6 is a refined executive sedan designed for travelers who value a calm, comfortable journey and a polished cabin. It offers generous seating for adults, useful luggage space, and an easygoing driving character that works well on Islamabad roads and longer motorway trips. The quiet interior and supportive seating make it particularly suitable for business travel, airport transfers, and families wanting an upscale experience without choosing a large SUV. Clear controls, confident road manners, and a spacious sedan layout help passengers stay relaxed throughout both short appointments and full-day intercity journeys.',
    amenities: [
      'Climate Control',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Airbags',
    ],
  },
  'bmw-3-series-2024': {
    description:
      'BMW 3 Series combines the practical dimensions of a compact executive sedan with a responsive, composed feel on the road. Its cabin comfortably accommodates couples, small families, or business travelers, while the boot handles everyday suitcases and work luggage without making the car cumbersome in city traffic. The car feels equally at home moving through Lahore streets or settling into a steady intercity cruise. It is a strong choice for customers who want an engaging yet comfortable drive, a premium interior atmosphere, and manageable proportions for parking, hotel arrivals, and busy commercial areas.',
    amenities: [
      'Climate Control',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
    ],
  },
  'bmw-5-series-2024': {
    description:
      'BMW 5 Series is a spacious executive sedan suited to airport collections, corporate schedules, and comfortable long-distance travel. The cabin provides generous room for front and rear passengers, with a useful luggage area for several travel bags. Its settled ride and confident highway character make longer routes feel composed, while the familiar sedan footprint remains practical around Islamabad and Rawalpindi. Customers seeking a premium car for meetings, special occasions, or family journeys will appreciate its balance of passenger comfort, road presence, and everyday usability without the bulk associated with a full-size luxury SUV.',
    amenities: [
      'Climate Control',
      'Navigation',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
    ],
  },
  'changan-alsvin-2024': {
    description:
      'Changan Alsvin is a compact sedan that offers a practical mix of comfort, easy handling, and useful passenger space for everyday travel. Its manageable size is convenient in Lahore traffic and tight parking areas, while the separate boot provides room for typical airport or weekend luggage. The cabin layout is straightforward and comfortable for couples, small families, and individual business travelers. It is especially suitable for city appointments, airport transfers, and moderate intercity routes where customers want the convenience of a sedan without paying for a larger vehicle or carrying unnecessary exterior bulk.',
    amenities: [
      'Air Conditioning',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'ABS',
      'Airbags',
    ],
  },
  'haval-h6-2024': {
    description:
      'Haval H6 is a roomy SUV with a comfortable cabin and elevated seating position that suits families, groups, and travelers carrying several bags. Its wider interior gives passengers space to settle in, while the luggage area is useful for airport collections and longer leisure trips. The vehicle feels substantial on highways yet remains manageable for regular urban driving around Lahore. It is a sensible choice for customers who prefer SUV visibility, flexible passenger practicality, and a relaxed ride for mixed city and intercity use, without moving into the size or cost of a full-size luxury off-roader.',
    amenities: [
      'Climate Control',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'honda-accord-2024': {
    description:
      'Honda Accord is a comfortable midsize sedan with generous passenger room and a composed character that works particularly well for longer journeys. Rear-seat space makes it useful for families and business guests, while the boot can accommodate regular suitcases and daily luggage. Its smooth road manners suit Islamabad avenues, motorway travel, and formal airport transfers alike. Customers who want more cabin space than a compact sedan, but do not need an SUV, will find it a balanced option. The straightforward driving position and refined ride also make full-day schedules feel less tiring for occupants.',
    amenities: [
      'Climate Control',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'honda-br-v-2024': {
    description:
      'Honda BR-V is a practical seven-seat crossover intended for families and small groups that need flexible passenger capacity. Its cabin can accommodate additional travelers while still offering useful space for lighter luggage, and the seating layout works well for airport pickups, family visits, and local sightseeing. The elevated driving position improves visibility in busy traffic, yet the vehicle remains easier to place and park than many larger SUVs. It is best suited to customers prioritizing seating flexibility, everyday reliability, and sensible running comfort across Islamabad, Rawalpindi, and moderate intercity routes.',
    amenities: [
      'Air Conditioning',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'ABS',
      'Airbags',
      'Keyless Entry',
    ],
  },
  'honda-city-2024': {
    description:
      'Honda City is a familiar compact sedan that balances passenger comfort, boot space, and easy urban maneuvering. It is well suited to couples, small families, and business travelers who need dependable transport for meetings, shopping, airport runs, or short intercity journeys. The cabin provides sensible room for four to five occupants, while the luggage compartment handles normal travel bags without reducing seating space. Light controls and tidy dimensions make it convenient in crowded streets and parking areas. Customers wanting a straightforward sedan with more practicality than a small hatchback will find it an adaptable everyday choice.',
    amenities: [
      'Air Conditioning',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'ABS',
      'Airbags',
    ],
  },
  'honda-civic-2024': {
    description:
      'Honda Civic offers a comfortable sedan cabin with a more composed and responsive driving feel than many basic city cars. Its seating and boot capacity work well for couples, families, and corporate travelers carrying standard luggage, while the low, stable stance feels reassuring on faster roads. The car is practical for daily movement across Lahore and comfortable enough for motorway journeys between major cities. It suits customers looking for modern sedan proportions, easy controls, and a pleasant balance between relaxed passenger comfort and confident road behavior without stepping up to a larger executive model.',
    amenities: [
      'Climate Control',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'hyundai-elantra-2024': {
    description:
      'Hyundai Elantra is a well-proportioned sedan with a spacious-feeling cabin, supportive seating, and useful luggage capacity for ordinary travel needs. It handles urban routes comfortably while remaining settled on longer highway sections, making it suitable for family visits, business appointments, and airport journeys. The interior layout is approachable for drivers unfamiliar with the car, and rear passengers have practical room for extended trips. It is a good match for customers who want a modern alternative to established compact sedans, with balanced comfort, manageable dimensions, and enough versatility for both weekday city schedules and weekend intercity travel.',
    amenities: [
      'Climate Control',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Airbags',
    ],
  },
  'hyundai-tucson-2024': {
    description:
      'Hyundai Tucson is a comfortable compact SUV offering an elevated view, flexible cabin space, and a useful luggage area. It accommodates families and small groups more easily than a sedan, especially when airport bags or shopping need to travel with passengers. The vehicle remains manageable in city traffic while providing a stable, relaxed feel for longer routes outside Islamabad. It is well suited to leisure travel, family visits, and customers who appreciate easier entry and exit. Its balanced size provides SUV practicality without the demanding footprint of a large seven-seat or off-road vehicle.',
    amenities: [
      'Climate Control',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'kia-picanto-2024': {
    description:
      'Kia Picanto is a compact city hatchback designed for simple, efficient travel through crowded urban areas. Its small exterior makes parking and narrow streets easier, while the cabin is comfortable for one to four occupants on shorter journeys. Luggage capacity is best suited to light bags, making the car ideal for solo travelers, couples, local errands, and business appointments rather than large airport groups. The upright seating and straightforward controls help it feel approachable in daily use. Customers who value maneuverability, affordability, and uncomplicated transport around Rawalpindi will find it particularly practical.',
    amenities: [
      'Air Conditioning',
      'Bluetooth',
      'USB Charging',
      'ABS',
      'Airbags',
    ],
  },
  'kia-sportage-2024': {
    description:
      'Kia Sportage is a versatile compact SUV with comfortable seating, an elevated driving position, and enough luggage room for family or airport travel. Its cabin gives passengers more flexibility than a typical sedan while the overall dimensions remain suitable for Islamabad streets, hotel entrances, and regular parking spaces. The settled ride works well on city roads and intercity highways, making it useful for day trips and longer itineraries. It is a strong option for couples, families, or business groups wanting modern SUV practicality and passenger comfort without choosing an oversized or highly specialized vehicle.',
    amenities: [
      'Climate Control',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'lexus-es-2024': {
    description:
      'Lexus ES is a comfort-focused luxury sedan suited to executive transfers, formal occasions, and relaxed long-distance journeys. Its cabin provides generous passenger space, particularly for rear occupants, and the boot supports regular airport luggage. The smooth, quiet character is helpful during busy schedules when travelers want to arrive rested, while the sedan shape remains convenient around Lahore hotels and commercial districts. It is best for customers prioritizing refinement, supportive seating, and an understated premium environment rather than SUV size. The balanced road manners also make it suitable for comfortable motorway travel between cities.',
    amenities: [
      'Climate Control',
      'Navigation',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'mercedes-c-class-2024': {
    description:
      'Mercedes C-Class is a compact luxury sedan that combines an upscale cabin atmosphere with dimensions that remain practical for city use. It comfortably serves couples, individual executives, and small families, with a separate boot for standard travel bags. The composed ride works well for meetings around Islamabad and for motorway journeys where steady comfort matters. Its manageable size helps at crowded destinations, while the seating and interior finish provide a more formal experience than an ordinary compact sedan. It is an appropriate choice for business travel, special events, or customers seeking premium comfort without requiring a larger chauffeur-style vehicle.',
    amenities: [
      'Climate Control',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'mercedes-e-class-2024': {
    description:
      'Mercedes E-Class is a spacious executive sedan developed around passenger comfort, a composed ride, and a refined cabin. Rear-seat occupants have useful room for longer journeys, while the luggage compartment supports airport transfers and multi-day business travel. Its calm highway behavior makes it suitable for intercity schedules, yet the sedan remains appropriate for hotel arrivals and formal events in Lahore. Customers arranging executive transport, family occasions, or premium airport service will appreciate the balance of space and understated presence. It provides a relaxed alternative to a large SUV while retaining substantial comfort for several adults.',
    amenities: [
      'Climate Control',
      'Navigation',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'mg-hs-2024': {
    description:
      'MG HS is a comfortable compact SUV with generous cabin width, an elevated seating position, and flexible room for passengers and luggage. It suits families, couples with several travel bags, and small groups who want more interior space than a sedan. The vehicle is manageable for everyday Islamabad driving and feels settled enough for longer routes or weekend trips. Easy entry and exit are useful for varied passenger ages, while the luggage area supports airport collections and shopping. It is a practical choice for customers seeking modern SUV comfort and versatility without moving to a large seven-seat vehicle.',
    amenities: [
      'Climate Control',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'range-rover-sport-2024': {
    description:
      'Range Rover Sport is a substantial luxury SUV offering a commanding seating position, a spacious cabin, and strong luggage practicality. It is suited to premium family travel, important events, and longer journeys where passengers value room to relax and an assured road presence. The elevated cabin makes entry, visibility, and extended travel comfortable, while the cargo area accommodates several larger bags. Its size is best matched to customers comfortable with a full-size vehicle and routes with adequate parking. For airport service or intercity travel, it provides an upscale alternative when a luxury sedan does not offer enough space.',
    amenities: [
      'Climate Control',
      'Navigation',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'suzuki-alto-2024': {
    description:
      'Suzuki Alto is a small economy hatchback focused on easy city travel, simple controls, and convenient parking. Its compact footprint is especially useful in dense Lahore traffic and narrow local streets. The cabin is best for solo travelers, couples, or a small group carrying light luggage, rather than passengers with several large suitcases. Short commutes, shopping trips, and routine appointments are its natural strengths. Customers choosing the Alto typically prioritize affordability and maneuverability over extensive cabin or cargo space, making it a sensible option for straightforward urban schedules where a larger sedan would add unnecessary cost and bulk.',
    amenities: ['Air Conditioning', 'USB Charging', 'ABS', 'Airbags'],
  },
  'suzuki-cultus-2023': {
    description:
      'Suzuki Cultus is a practical compact hatchback that offers more cabin flexibility than the smallest economy cars while remaining easy to drive and park. It is suitable for couples, small families, and individual travelers with modest luggage needs. The upright cabin makes city journeys comfortable, and the rear cargo area can manage everyday bags or a light airport load. Its manageable dimensions work well throughout Islamabad and Rawalpindi, particularly for frequent stops and busy commercial areas. Customers wanting economical transport with useful passenger room and straightforward operation will find it a balanced choice for local and shorter intercity travel.',
    amenities: [
      'Air Conditioning',
      'Bluetooth',
      'USB Charging',
      'ABS',
      'Airbags',
      'Keyless Entry',
    ],
  },
  'suzuki-swift-2024': {
    description:
      'Suzuki Swift is a compact hatchback with tidy dimensions, comfortable front seating, and a lively, easy-to-manage character in urban traffic. It works well for solo travelers, couples, and small families carrying light to moderate luggage. The hatchback layout adds flexibility for everyday bags, while the compact exterior simplifies parking around Lahore shops, offices, and residential areas. It is also capable of short intercity journeys when passengers do not require the boot space of a sedan. Customers seeking a modern, economical car that feels convenient in the city without being overly basic will appreciate its practical balance.',
    amenities: [
      'Air Conditioning',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'ABS',
      'Airbags',
      'Keyless Entry',
    ],
  },
  'toyota-camry-2023': {
    description:
      'Toyota Camry is a roomy midsize sedan suited to comfortable airport service, corporate travel, and longer family journeys. Its cabin provides generous seating for adults and a useful boot for regular suitcases, while the relaxed driving character helps passengers remain comfortable on motorway routes. The car offers more space and presence than a compact sedan without the height or bulk of an SUV. It is a sensible option for executives, couples, and families who value familiar controls, a smooth ride, and dependable day-to-day usability. Urban appointments and intercity schedules are both handled with an easy, composed manner.',
    amenities: [
      'Climate Control',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'toyota-corolla-2025': {
    description:
      'Toyota Corolla is a practical and comfortable sedan suited to both daily city travel and longer intercity journeys. Its cabin offers a balanced amount of passenger space, while the boot is useful for regular luggage needs. The car is easy to drive in busy urban areas and remains comfortable on highway routes, making it a sensible option for couples, families, and business travelers. Its straightforward controls, smooth ride, and familiar sedan layout make it a dependable choice for customers who want comfort, space, and ease of use without moving into a larger SUV.',
    amenities: [
      'Air Conditioning',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'ABS',
      'Airbags',
      'Keyless Entry',
    ],
  },
  'toyota-corolla-cross-2024': {
    description:
      'Toyota Corolla Cross provides compact SUV practicality with familiar, easygoing road manners. The elevated cabin offers comfortable access and useful visibility, while passenger and luggage space support family trips, airport collections, and everyday shopping. Its dimensions are easier to manage in Islamabad than a large SUV, yet occupants gain more flexibility than they would in a conventional sedan. The vehicle is suitable for couples, small families, and business travelers who prefer a higher seating position and adaptable cargo area. City driving and longer highway routes are both handled in a calm, approachable way.',
    amenities: [
      'Climate Control',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'toyota-fortuner-2025': {
    description:
      'Toyota Fortuner is a large seven-seat SUV intended for families, groups, and travelers who need substantial passenger and luggage flexibility. Its elevated seating position and robust proportions provide a confident feel on longer routes, while the adaptable cabin is useful for airport transfers or family excursions. With all seats occupied, luggage should be planned carefully, but fewer passengers allow generous cargo room. The vehicle is best suited to customers comfortable driving a larger SUV and wanting added space, road presence, and versatility. It works particularly well for intercity travel and group schedules around Islamabad and Rawalpindi.',
    amenities: [
      'Climate Control',
      'Navigation',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'toyota-innova-2023': {
    description:
      'Toyota Innova is a people carrier built around passenger capacity, easy cabin access, and flexible space for family or group travel. It can accommodate up to eight occupants, though using fewer seats leaves more room for larger luggage loads. The upright interior is practical for airport collections, weddings, family visits, and longer group journeys where a sedan would be too restrictive. Its driving character is straightforward and comfortable rather than sporty, making it appropriate for steady city and highway travel. Customers organizing transport for several adults or children will value its adaptable seating and useful overall practicality.',
    amenities: [
      'Air Conditioning',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'ABS',
      'Airbags',
    ],
  },
  'toyota-land-cruiser-2024': {
    description:
      'Toyota Land Cruiser is a full-size luxury SUV with a spacious cabin, commanding seating position, and generous capability for passengers and luggage. It is well suited to executive groups, family travel, special occasions, and longer routes where comfort and substantial road presence are priorities. The broad interior provides useful room for adults, while the cargo area supports airport bags and extended itineraries. Its large dimensions require suitable parking and are best for customers accustomed to bigger vehicles. For Islamabad transfers or intercity journeys, it offers a composed, premium environment with the practicality expected from a large SUV.',
    amenities: [
      'Climate Control',
      'Navigation',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'toyota-prado-2024': {
    description:
      'Toyota Prado is a spacious seven-seat SUV that balances family practicality, an elevated driving position, and comfortable long-distance travel. The flexible cabin can carry additional passengers or provide more luggage room when the rear seating is not required. It is suitable for airport pickups, family holidays, formal events, and intercity routes where a compact car would feel restrictive. The vehicle has a substantial footprint, so it best serves customers comfortable with larger SUVs and destinations with reasonable parking access. Its upright seating and stable road character help occupants remain comfortable across varied city and highway schedules.',
    amenities: [
      'Climate Control',
      'Navigation',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'Parking Sensors',
      'Cruise Control',
      'Keyless Entry',
      'Airbags',
    ],
  },
  'toyota-vitz-2020': {
    description:
      'Toyota Vitz is a compact automatic hatchback that is easy to maneuver through Rawalpindi traffic and convenient to park in busy neighborhoods. The cabin works best for solo travelers, couples, or a small family carrying light luggage, while the hatchback opening provides flexibility for everyday bags. Its simple driving position and manageable size make short city schedules, shopping trips, and local appointments straightforward. It can handle shorter highway journeys when passenger and luggage demands are modest. Customers who want economical automatic transport with more cabin usability than the smallest city cars will find it a practical option.',
    amenities: [
      'Air Conditioning',
      'Bluetooth',
      'USB Charging',
      'ABS',
      'Airbags',
    ],
  },
  'toyota-yaris-2024': {
    description:
      'Toyota Yaris is a compact sedan offering comfortable everyday seating, a separate boot, and manageable dimensions for Lahore traffic. It suits couples, small families, and business travelers who need room for normal luggage without choosing a larger or more expensive car. The straightforward controls and easy driving character are useful for city appointments, airport transfers, and occasional intercity journeys. Rear passengers have practical space for moderate trips, while the boot keeps bags separate from the cabin. It is a sensible choice for customers prioritizing dependable, uncomplicated transport with the added luggage practicality of a sedan.',
    amenities: [
      'Air Conditioning',
      'Bluetooth',
      'USB Charging',
      'Rear Camera',
      'ABS',
      'Airbags',
      'Keyless Entry',
    ],
  },
};

export const CAR_TRANSFER_PACKAGE_SEEDS = [
  ['Toyota Corolla', 'airport-lhe-pakistan', 'lhe-gulberg', 25],
  ['Toyota Corolla', 'airport-lhe-pakistan', 'lhe-dha', 30],
  ['Toyota Corolla', 'airport-lhe-pakistan', 'lhe-bahria', 42],
  ['Toyota Yaris', 'airport-lhe-pakistan', 'lhe-gulberg', 22],
  ['Toyota Yaris', 'airport-lhe-pakistan', 'lhe-dha', 28],
  ['Toyota Innova', 'airport-lhe-pakistan', 'lhe-bahria', 55],
  ['Kia Sportage', 'airport-isb-pakistan', 'isb-city', 35],
  ['Kia Sportage', 'airport-isb-pakistan', 'isb-blue-area', 38],
  ['Toyota Fortuner', 'airport-isb-pakistan', 'isb-f6-f7', 48],
  ['Toyota Fortuner', 'airport-isb-pakistan', 'rwp-city', 52],
  ['Changan Alsvin', 'airport-lhe-pakistan', 'lhe-gulberg', 24],
  ['Changan Alsvin', 'airport-lhe-pakistan', 'lhe-dha', 29],
  ['Toyota Camry', 'airport-lhe-pakistan', 'lhe-gulberg', 42],
  ['Toyota Camry', 'airport-lhe-pakistan', 'lhe-bahria', 58],
  ['Toyota Prado', 'airport-lhe-pakistan', 'lhe-gulberg', 60],
  ['Toyota Prado', 'airport-lhe-pakistan', 'lhe-bahria', 82],
  ['Mercedes E-Class', 'airport-lhe-pakistan', 'lhe-gulberg', 75],
  ['Lexus ES', 'airport-lhe-pakistan', 'lhe-dha', 78],
  ['Toyota Innova', 'airport-lhe-pakistan', 'lhe-dha', 55],
  ['Suzuki Cultus', 'airport-isb-pakistan', 'isb-blue-area', 25],
  ['Honda BR-V', 'airport-isb-pakistan', 'isb-city', 36],
  ['Honda BR-V', 'airport-isb-pakistan', 'rwp-city', 42],
  ['Toyota Land Cruiser', 'airport-isb-pakistan', 'isb-f6-f7', 78],
  ['Toyota Land Cruiser', 'airport-isb-pakistan', 'isb-blue-area', 82],
  ['BMW 5 Series', 'airport-isb-pakistan', 'isb-city', 80],
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
    const content = CAR_FLEET_CONTENT[source.assetSlug];
    if (!content)
      throw new Error(`Missing Cars content for ${source.assetSlug}.`);
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
      description: content.description,
      amenities: content.amenities,
      passengerCapacity: source.passengers,
      luggageCapacity: source.luggage,
      transmission: source.transmission,
      quantity: source.quantity,
      rentalEnabled: source.rentalEnabled,
      transferEnabled: source.transferEnabled,
      rentalPrice: source.rentalPrice,
      currency: 'USD',
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
        currency: 'USD',
        isActive: true,
      },
      update: { price, currency: 'USD', isActive: true },
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
