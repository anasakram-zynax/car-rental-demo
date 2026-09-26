export interface DestinationEntry {
  code: string;
  name: string;
  countryCode: string;
  latitude?: number;
  longitude?: number;
}

export const POPULAR_DESTINATIONS: DestinationEntry[] = [
  // Spain
  { code: 'BCN', name: 'Barcelona', countryCode: 'ES', latitude: 41.3874, longitude: 2.1686 },
  { code: 'MAD', name: 'Madrid', countryCode: 'ES', latitude: 40.4168, longitude: -3.7038 },
  { code: 'PMI', name: 'Majorca', countryCode: 'ES', latitude: 39.5696, longitude: 2.6502 },
  { code: 'IBZ', name: 'Ibiza', countryCode: 'ES', latitude: 38.9067, longitude: 1.4206 },
  { code: 'AGP', name: 'Malaga', countryCode: 'ES', latitude: 36.7213, longitude: -4.4214 },
  { code: 'ALC', name: 'Alicante', countryCode: 'ES', latitude: 38.3452, longitude: -0.4810 },
  { code: 'VLC', name: 'Valencia', countryCode: 'ES', latitude: 39.4699, longitude: -0.3763 },
  { code: 'SVQ', name: 'Seville', countryCode: 'ES', latitude: 37.3891, longitude: -5.9845 },
  { code: 'LPA', name: 'Gran Canaria', countryCode: 'ES', latitude: 28.1235, longitude: -15.4363 },
  { code: 'TFS', name: 'Tenerife', countryCode: 'ES', latitude: 28.0473, longitude: -16.5725 },
  { code: 'ACE', name: 'Lanzarote', countryCode: 'ES', latitude: 29.0430, longitude: -13.6420 },
  { code: 'FUE', name: 'Fuerteventura', countryCode: 'ES', latitude: 28.4016, longitude: -14.0500 },
  { code: 'GRO', name: 'Girona', countryCode: 'ES', latitude: 41.9794, longitude: 2.8219 },
  { code: 'BIO', name: 'Bilbao', countryCode: 'ES', latitude: 43.2630, longitude: -2.9350 },

  // United Kingdom
  { code: 'LON', name: 'London', countryCode: 'GB', latitude: 51.5074, longitude: -0.1278 },
  { code: 'MAN', name: 'Manchester', countryCode: 'GB', latitude: 53.4808, longitude: -2.2426 },
  { code: 'BIR', name: 'Birmingham', countryCode: 'GB', latitude: 52.4862, longitude: -1.8904 },
  { code: 'EDI', name: 'Edinburgh', countryCode: 'GB', latitude: 55.9533, longitude: -3.1883 },
  { code: 'GLA', name: 'Glasgow', countryCode: 'GB', latitude: 55.8642, longitude: -4.2518 },
  { code: 'LPL', name: 'Liverpool', countryCode: 'GB', latitude: 53.4084, longitude: -2.9916 },

  // France
  { code: 'PAR', name: 'Paris', countryCode: 'FR', latitude: 48.8566, longitude: 2.3522 },
  { code: 'NCE', name: 'Nice', countryCode: 'FR', latitude: 43.7102, longitude: 7.2620 },
  { code: 'MRS', name: 'Marseille', countryCode: 'FR', latitude: 43.2965, longitude: 5.3698 },
  { code: 'LYS', name: 'Lyon', countryCode: 'FR', latitude: 45.7640, longitude: 4.8357 },
  { code: 'TLS', name: 'Toulouse', countryCode: 'FR', latitude: 43.6047, longitude: 1.4442 },
  { code: 'BOD', name: 'Bordeaux', countryCode: 'FR', latitude: 44.8378, longitude: -0.5792 },

  // Italy
  { code: 'ROM', name: 'Rome', countryCode: 'IT', latitude: 41.9028, longitude: 12.4964 },
  { code: 'MIL', name: 'Milan', countryCode: 'IT', latitude: 45.4642, longitude: 9.1900 },
  { code: 'VCE', name: 'Venice', countryCode: 'IT', latitude: 45.4408, longitude: 12.3155 },
  { code: 'FLR', name: 'Florence', countryCode: 'IT', latitude: 43.7696, longitude: 11.2558 },
  { code: 'NAP', name: 'Naples', countryCode: 'IT', latitude: 40.8518, longitude: 14.2681 },
  { code: 'PMO', name: 'Palermo', countryCode: 'IT', latitude: 38.1157, longitude: 13.3615 },
  { code: 'CTA', name: 'Catania', countryCode: 'IT', latitude: 37.5079, longitude: 15.0830 },

  // Germany
  { code: 'BER', name: 'Berlin', countryCode: 'DE', latitude: 52.5200, longitude: 13.4050 },
  { code: 'MUC', name: 'Munich', countryCode: 'DE', latitude: 48.1351, longitude: 11.5820 },
  { code: 'FRA', name: 'Frankfurt', countryCode: 'DE', latitude: 50.1109, longitude: 8.6821 },
  { code: 'HAM', name: 'Hamburg', countryCode: 'DE', latitude: 53.5511, longitude: 9.9937 },
  { code: 'DUS', name: 'Dusseldorf', countryCode: 'DE', latitude: 51.2277, longitude: 6.7735 },
  { code: 'CGN', name: 'Cologne', countryCode: 'DE', latitude: 50.9375, longitude: 6.9603 },

  // Netherlands
  { code: 'AMS', name: 'Amsterdam', countryCode: 'NL', latitude: 52.3676, longitude: 4.9041 },
  { code: 'RTM', name: 'Rotterdam', countryCode: 'NL', latitude: 51.9244, longitude: 4.4777 },

  // Belgium
  { code: 'BRU', name: 'Brussels', countryCode: 'BE', latitude: 50.8503, longitude: 4.3517 },

  // Switzerland
  { code: 'ZRH', name: 'Zurich', countryCode: 'CH', latitude: 47.3769, longitude: 8.5417 },
  { code: 'GVA', name: 'Geneva', countryCode: 'CH', latitude: 46.2044, longitude: 6.1432 },
  { code: 'BSL', name: 'Basel', countryCode: 'CH', latitude: 47.5596, longitude: 7.5886 },

  // Austria
  { code: 'VIE', name: 'Vienna', countryCode: 'AT', latitude: 48.2082, longitude: 16.3738 },

  // Portugal
  { code: 'LIS', name: 'Lisbon', countryCode: 'PT', latitude: 38.7223, longitude: -9.1393 },
  { code: 'OPO', name: 'Porto', countryCode: 'PT', latitude: 41.1579, longitude: -8.6291 },
  { code: 'FAO', name: 'Faro', countryCode: 'PT', latitude: 37.0194, longitude: -7.9304 },

  // Greece
  { code: 'ATH', name: 'Athens', countryCode: 'GR', latitude: 37.9838, longitude: 23.7275 },
  { code: 'HER', name: 'Heraklion', countryCode: 'GR', latitude: 35.3387, longitude: 25.1442 },
  { code: 'RHO', name: 'Rhodes', countryCode: 'GR', latitude: 36.4341, longitude: 28.2176 },
  { code: 'JTR', name: 'Santorini', countryCode: 'GR', latitude: 36.3932, longitude: 25.4615 },
  { code: 'CFU', name: 'Corfu', countryCode: 'GR', latitude: 39.6243, longitude: 19.9217 },

  // Turkey
  { code: 'IST', name: 'Istanbul', countryCode: 'TR', latitude: 41.0082, longitude: 28.9784 },
  { code: 'AYT', name: 'Antalya', countryCode: 'TR', latitude: 36.8969, longitude: 30.7133 },
  { code: 'DLM', name: 'Dalaman', countryCode: 'TR', latitude: 36.7660, longitude: 28.7633 },
  { code: 'BJV', name: 'Bodrum', countryCode: 'TR', latitude: 37.0344, longitude: 27.4305 },

  // UAE
  { code: 'DXB', name: 'Dubai', countryCode: 'AE', latitude: 25.2048, longitude: 55.2708 },
  { code: 'AUH', name: 'Abu Dhabi', countryCode: 'AE', latitude: 24.4539, longitude: 54.3773 },

  // USA
  { code: 'NYQ', name: 'New York', countryCode: 'US', latitude: 40.7128, longitude: -74.0060 },
  { code: 'LAX', name: 'Los Angeles', countryCode: 'US', latitude: 34.0522, longitude: -118.2437 },
  { code: 'MIA', name: 'Miami', countryCode: 'US', latitude: 25.7617, longitude: -80.1918 },
  { code: 'ORL', name: 'Orlando', countryCode: 'US', latitude: 28.5383, longitude: -81.3792 },
  { code: 'CHI', name: 'Chicago', countryCode: 'US', latitude: 41.8781, longitude: -87.6298 },
  { code: 'SFO', name: 'San Francisco', countryCode: 'US', latitude: 37.7749, longitude: -122.4194 },
  { code: 'LAS', name: 'Las Vegas', countryCode: 'US', latitude: 36.1699, longitude: -115.1398 },

  // Thailand
  { code: 'BKK', name: 'Bangkok', countryCode: 'TH', latitude: 13.7563, longitude: 100.5018 },
  { code: 'HKT', name: 'Phuket', countryCode: 'TH', latitude: 7.8804, longitude: 98.3923 },
  { code: 'CNX', name: 'Chiang Mai', countryCode: 'TH', latitude: 18.7883, longitude: 98.9853 },

  // Mexico
  { code: 'CUN', name: 'Cancun', countryCode: 'MX', latitude: 21.1619, longitude: -86.8515 },
  { code: 'MEX', name: 'Mexico City', countryCode: 'MX', latitude: 19.4326, longitude: -99.1332 },

  // Caribbean
  { code: 'PUJ', name: 'Punta Cana', countryCode: 'DO', latitude: 18.5601, longitude: -68.3725 },
  { code: 'NAS', name: 'Nassau', countryCode: 'BS', latitude: 25.0343, longitude: -77.3963 },
  { code: 'MBJ', name: 'Montego Bay', countryCode: 'JM', latitude: 18.4762, longitude: -77.8939 },

  // India
  { code: 'DEL', name: 'Delhi', countryCode: 'IN', latitude: 28.7041, longitude: 77.1025 },
  { code: 'BOM', name: 'Mumbai', countryCode: 'IN', latitude: 19.0760, longitude: 72.8777 },
  { code: 'MAA', name: 'Chennai', countryCode: 'IN', latitude: 13.0827, longitude: 80.2707 },

  // Japan
  { code: 'TYO', name: 'Tokyo', countryCode: 'JP', latitude: 35.6762, longitude: 139.6503 },
  { code: 'OSA', name: 'Osaka', countryCode: 'JP', latitude: 34.6937, longitude: 135.5023 },

  // Egypt
  { code: 'HBE', name: 'Hurghada', countryCode: 'EG', latitude: 27.2579, longitude: 33.8116 },
  { code: 'SSH', name: 'Sharm El Sheikh', countryCode: 'EG', latitude: 27.9158, longitude: 34.3300 },

  // Morocco
  { code: 'CMN', name: 'Casablanca', countryCode: 'MA', latitude: 33.5731, longitude: -7.5898 },
  { code: 'RAK', name: 'Marrakech', countryCode: 'MA', latitude: 31.6295, longitude: -7.9811 },

  // Croatia
  { code: 'DBV', name: 'Dubrovnik', countryCode: 'HR', latitude: 42.6507, longitude: 18.0944 },
  { code: 'SPU', name: 'Split', countryCode: 'HR', latitude: 43.5081, longitude: 16.4402 },

  // Malta
  { code: 'MLA', name: 'Malta', countryCode: 'MT', latitude: 35.8989, longitude: 14.5146 },

  // Cyprus
  { code: 'LCA', name: 'Larnaca', countryCode: 'CY', latitude: 34.9221, longitude: 33.6230 },
  { code: 'PFO', name: 'Paphos', countryCode: 'CY', latitude: 34.7720, longitude: 32.4297 },

  // Middle East
  { code: 'RUH', name: 'Riyadh', countryCode: 'SA', latitude: 24.7136, longitude: 46.6753 },
  { code: 'JED', name: 'Jeddah', countryCode: 'SA', latitude: 21.4858, longitude: 39.1925 },
  { code: 'DMM', name: 'Dammam', countryCode: 'SA', latitude: 26.4207, longitude: 50.0888 },
  { code: 'DOH', name: 'Doha', countryCode: 'QA', latitude: 25.2854, longitude: 51.531 },
  { code: 'BAH', name: 'Manama', countryCode: 'BH', latitude: 26.2285, longitude: 50.586 },
  { code: 'KWI', name: 'Kuwait City', countryCode: 'KW', latitude: 29.3759, longitude: 47.9774 },
  { code: 'MCT', name: 'Muscat', countryCode: 'OM', latitude: 23.588, longitude: 58.3829 },
  { code: 'AMM', name: 'Amman', countryCode: 'JO', latitude: 31.9454, longitude: 35.9284 },
  { code: 'BEY', name: 'Beirut', countryCode: 'LB', latitude: 33.8938, longitude: 35.5018 },

  // South Asia
  { code: 'BLR', name: 'Bangalore', countryCode: 'IN', latitude: 12.9716, longitude: 77.5946 },
  { code: 'HYD', name: 'Hyderabad', countryCode: 'IN', latitude: 17.385, longitude: 78.4867 },
  { code: 'CCU', name: 'Kolkata', countryCode: 'IN', latitude: 22.5726, longitude: 88.3639 },
  { code: 'CMB', name: 'Colombo', countryCode: 'LK', latitude: 6.9271, longitude: 79.8612 },
  { code: 'KTM', name: 'Kathmandu', countryCode: 'NP', latitude: 27.7172, longitude: 85.324 },

  // Southeast Asia
  { code: 'MNL', name: 'Manila', countryCode: 'PH', latitude: 14.5995, longitude: 120.9842 },
  { code: 'SGN', name: 'Ho Chi Minh City', countryCode: 'VN', latitude: 10.8231, longitude: 106.6297 },
  { code: 'HAN', name: 'Hanoi', countryCode: 'VN', latitude: 21.0278, longitude: 105.8342 },
  { code: 'CGK', name: 'Jakarta', countryCode: 'ID', latitude: -6.2088, longitude: 106.8456 },
  { code: 'DPS', name: 'Bali', countryCode: 'ID', latitude: -8.3405, longitude: 115.092 },
  { code: 'PNH', name: 'Phnom Penh', countryCode: 'KH', latitude: 11.5564, longitude: 104.9282 },
  { code: 'RGN', name: 'Yangon', countryCode: 'MM', latitude: 16.8661, longitude: 96.1951 },

  // East Asia
  { code: 'BJS', name: 'Beijing', countryCode: 'CN', latitude: 39.9042, longitude: 116.4074 },
  { code: 'SHA', name: 'Shanghai', countryCode: 'CN', latitude: 31.2304, longitude: 121.4737 },
  { code: 'TPE', name: 'Taipei', countryCode: 'TW', latitude: 25.033, longitude: 121.5654 },
  { code: 'SEL', name: 'Seoul', countryCode: 'KR', latitude: 37.5665, longitude: 126.978 },

  // Africa
  { code: 'JNB', name: 'Johannesburg', countryCode: 'ZA', latitude: -26.2041, longitude: 28.0473 },
  { code: 'CPT', name: 'Cape Town', countryCode: 'ZA', latitude: -33.9249, longitude: 18.4241 },
  { code: 'NBO', name: 'Nairobi', countryCode: 'KE', latitude: -1.2921, longitude: 36.8219 },
  { code: 'LOS', name: 'Lagos', countryCode: 'NG', latitude: 6.5244, longitude: 3.3792 },
  { code: 'ACC', name: 'Accra', countryCode: 'GH', latitude: 5.6037, longitude: -0.187 },
  { code: 'ADD', name: 'Addis Ababa', countryCode: 'ET', latitude: 9.025, longitude: 38.7469 },

  // Europe — additional
  { code: 'PRG', name: 'Prague', countryCode: 'CZ', latitude: 50.0755, longitude: 14.4378 },
  { code: 'BUD', name: 'Budapest', countryCode: 'HU', latitude: 47.4979, longitude: 19.0402 },
  { code: 'WAW', name: 'Warsaw', countryCode: 'PL', latitude: 52.2297, longitude: 21.0122 },
  { code: 'KRK', name: 'Krakow', countryCode: 'PL', latitude: 50.0647, longitude: 19.945 },
  { code: 'CPH', name: 'Copenhagen', countryCode: 'DK', latitude: 55.6761, longitude: 12.5683 },
  { code: 'STO', name: 'Stockholm', countryCode: 'SE', latitude: 59.3293, longitude: 18.0686 },
  { code: 'OSL', name: 'Oslo', countryCode: 'NO', latitude: 59.9139, longitude: 10.7522 },
  { code: 'HEL', name: 'Helsinki', countryCode: 'FI', latitude: 60.1699, longitude: 24.9384 },
  { code: 'DUB', name: 'Dublin', countryCode: 'IE', latitude: 53.3498, longitude: -6.2603 },
  { code: 'KEF', name: 'Reykjavik', countryCode: 'IS', latitude: 64.1466, longitude: -21.9426 },
  { code: 'OTP', name: 'Bucharest', countryCode: 'RO', latitude: 44.4268, longitude: 26.1025 },
  { code: 'BEG', name: 'Belgrade', countryCode: 'RS', latitude: 44.7866, longitude: 20.4489 },

  // Americas — additional
  { code: 'HOU', name: 'Houston', countryCode: 'US', latitude: 29.7604, longitude: -95.3698 },
  { code: 'DFW', name: 'Dallas', countryCode: 'US', latitude: 32.7767, longitude: -96.797 },
  { code: 'WAS', name: 'Washington', countryCode: 'US', latitude: 38.9072, longitude: -77.0369 },
  { code: 'BOS', name: 'Boston', countryCode: 'US', latitude: 42.3601, longitude: -71.0589 },
  { code: 'SEA', name: 'Seattle', countryCode: 'US', latitude: 47.6062, longitude: -122.3321 },
  { code: 'DEN', name: 'Denver', countryCode: 'US', latitude: 39.7392, longitude: -104.9903 },
  { code: 'ATL', name: 'Atlanta', countryCode: 'US', latitude: 33.749, longitude: -84.388 },
  { code: 'MSP', name: 'Minneapolis', countryCode: 'US', latitude: 44.9778, longitude: -93.265 },
  { code: 'PHL', name: 'Philadelphia', countryCode: 'US', latitude: 39.9526, longitude: -75.1652 },
  { code: 'PHX', name: 'Phoenix', countryCode: 'US', latitude: 33.4484, longitude: -112.074 },
  { code: 'SAN', name: 'San Diego', countryCode: 'US', latitude: 32.7157, longitude: -117.1611 },
  { code: 'BOG', name: 'Bogota', countryCode: 'CO', latitude: 4.711, longitude: -74.0721 },
  { code: 'LIM', name: 'Lima', countryCode: 'PE', latitude: -12.0464, longitude: -77.0428 },
  { code: 'SCL', name: 'Santiago', countryCode: 'CL', latitude: -33.4489, longitude: -70.6693 },
  { code: 'BUE', name: 'Buenos Aires', countryCode: 'AR', latitude: -34.6037, longitude: -58.3816 },
  { code: 'SAO', name: 'São Paulo', countryCode: 'BR', latitude: -23.5505, longitude: -46.6333 },

  // Oceania
  { code: 'AKL', name: 'Auckland', countryCode: 'NZ', latitude: -36.8485, longitude: 174.7633 },
  { code: 'BNE', name: 'Brisbane', countryCode: 'AU', latitude: -27.4698, longitude: 153.0251 },
];

export function searchDestinations(query: string): DestinationEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  return POPULAR_DESTINATIONS.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.code.toLowerCase().includes(q) ||
      d.countryCode.toLowerCase().includes(q),
  ).slice(0, 10);
}
