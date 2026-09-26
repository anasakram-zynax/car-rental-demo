/**
 * Seed script for FlightLocation — airports, cities, and metro areas.
 *
 * Populates the FlightLocation table used by the autocomplete system.
 * Run after creating the migration for the FlightLocation model.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/seed-flight-locations.ts
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../shared/database/prisma.service';

interface FlightLocationSeed {
  code: string;
  type: 'AIRPORT' | 'CITY' | 'METRO_AREA';
  name: string;
  cityName: string | null;
  countryCode: string | null;
  countryName: string | null;
  iataCityCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  popularityScore: number;
}

const LOCATIONS: FlightLocationSeed[] = [
  // ── METRO AREAS ────────────────────────────────────────
  { code: 'LON', type: 'METRO_AREA', name: 'London', cityName: 'London', countryCode: 'GB', countryName: 'United Kingdom', iataCityCode: 'LON', latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London', popularityScore: 100 },
  { code: 'PAR', type: 'METRO_AREA', name: 'Paris', cityName: 'Paris', countryCode: 'FR', countryName: 'France', iataCityCode: 'PAR', latitude: 48.8566, longitude: 2.3522, timezone: 'Europe/Paris', popularityScore: 98 },
  { code: 'NYC', type: 'METRO_AREA', name: 'New York', cityName: 'New York', countryCode: 'US', countryName: 'United States', iataCityCode: 'NYC', latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York', popularityScore: 97 },
  { code: 'UAE', type: 'METRO_AREA', name: 'United Arab Emirates', cityName: null, countryCode: 'AE', countryName: 'United Arab Emirates', iataCityCode: null, latitude: 23.4241, longitude: 53.8478, timezone: 'Asia/Dubai', popularityScore: 85 },
  { code: 'TOK', type: 'METRO_AREA', name: 'Tokyo', cityName: 'Tokyo', countryCode: 'JP', countryName: 'Japan', iataCityCode: 'TYO', latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo', popularityScore: 98 },
  { code: 'SEL', type: 'METRO_AREA', name: 'Seoul', cityName: 'Seoul', countryCode: 'KR', countryName: 'South Korea', iataCityCode: 'SEL', latitude: 37.5665, longitude: 126.978, timezone: 'Asia/Seoul', popularityScore: 95 },
  { code: 'SHA', type: 'METRO_AREA', name: 'Shanghai', cityName: 'Shanghai', countryCode: 'CN', countryName: 'China', iataCityCode: 'SHA', latitude: 31.2304, longitude: 121.4737, timezone: 'Asia/Shanghai', popularityScore: 94 },
  { code: 'KUL', type: 'METRO_AREA', name: 'Kuala Lumpur', cityName: 'Kuala Lumpur', countryCode: 'MY', countryName: 'Malaysia', iataCityCode: 'KUL', latitude: 3.139, longitude: 101.6869, timezone: 'Asia/Kuala_Lumpur', popularityScore: 90 },
  { code: 'SYD', type: 'METRO_AREA', name: 'Sydney', cityName: 'Sydney', countryCode: 'AU', countryName: 'Australia', iataCityCode: 'SYD', latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney', popularityScore: 91 },
  { code: 'JED', type: 'METRO_AREA', name: 'Jeddah / Riyadh', cityName: null, countryCode: 'SA', countryName: 'Saudi Arabia', iataCityCode: null, latitude: 24.7136, longitude: 46.6753, timezone: 'Asia/Riyadh', popularityScore: 85 },
  { code: 'CAI', type: 'METRO_AREA', name: 'Cairo', cityName: 'Cairo', countryCode: 'EG', countryName: 'Egypt', iataCityCode: 'CAI', latitude: 30.0444, longitude: 31.2357, timezone: 'Africa/Cairo', popularityScore: 88 },
  { code: 'BOM', type: 'METRO_AREA', name: 'Mumbai', cityName: 'Mumbai', countryCode: 'IN', countryName: 'India', iataCityCode: 'BOM', latitude: 19.076, longitude: 72.8777, timezone: 'Asia/Kolkata', popularityScore: 91 },

  // ── CITIES ─────────────────────────────────────────────
  { code: 'DXB', type: 'CITY', name: 'Dubai', cityName: 'Dubai', countryCode: 'AE', countryName: 'United Arab Emirates', iataCityCode: 'DXB', latitude: 25.2048, longitude: 55.2708, timezone: 'Asia/Dubai', popularityScore: 96 },
  { code: 'KHI', type: 'CITY', name: 'Karachi', cityName: 'Karachi', countryCode: 'PK', countryName: 'Pakistan', iataCityCode: 'KHI', latitude: 24.8607, longitude: 67.0011, timezone: 'Asia/Karachi', popularityScore: 90 },
  { code: 'DOH', type: 'CITY', name: 'Doha', cityName: 'Doha', countryCode: 'QA', countryName: 'Qatar', iataCityCode: 'DOH', latitude: 25.2854, longitude: 51.531, timezone: 'Asia/Qatar', popularityScore: 88 },
  { code: 'AUH', type: 'CITY', name: 'Abu Dhabi', cityName: 'Abu Dhabi', countryCode: 'AE', countryName: 'United Arab Emirates', iataCityCode: 'AUH', latitude: 24.4539, longitude: 54.3773, timezone: 'Asia/Dubai', popularityScore: 87 },
  { code: 'ISB', type: 'CITY', name: 'Islamabad', cityName: 'Islamabad', countryCode: 'PK', countryName: 'Pakistan', iataCityCode: 'ISB', latitude: 33.6844, longitude: 73.0479, timezone: 'Asia/Karachi', popularityScore: 82 },
  { code: 'LHE', type: 'CITY', name: 'Lahore', cityName: 'Lahore', countryCode: 'PK', countryName: 'Pakistan', iataCityCode: 'LHE', latitude: 31.5204, longitude: 74.3587, timezone: 'Asia/Karachi', popularityScore: 81 },
  { code: 'RUH', type: 'CITY', name: 'Riyadh', cityName: 'Riyadh', countryCode: 'SA', countryName: 'Saudi Arabia', iataCityCode: 'RUH', latitude: 24.7136, longitude: 46.6753, timezone: 'Asia/Riyadh', popularityScore: 83 },
  { code: 'JED', type: 'CITY', name: 'Jeddah', cityName: 'Jeddah', countryCode: 'SA', countryName: 'Saudi Arabia', iataCityCode: 'JED', latitude: 21.4858, longitude: 39.1925, timezone: 'Asia/Riyadh', popularityScore: 80 },
  { code: 'IST', type: 'CITY', name: 'Istanbul', cityName: 'Istanbul', countryCode: 'TR', countryName: 'Turkey', iataCityCode: 'IST', latitude: 41.0082, longitude: 28.9784, timezone: 'Europe/Istanbul', popularityScore: 92 },

  // ── Middle East cities ──────────────────────────────────
  { code: 'DMM', type: 'CITY', name: 'Dammam', cityName: 'Dammam', countryCode: 'SA', countryName: 'Saudi Arabia', iataCityCode: 'DMM', latitude: 26.4207, longitude: 50.0888, timezone: 'Asia/Riyadh', popularityScore: 78 },
  { code: 'MCT', type: 'CITY', name: 'Muscat', cityName: 'Muscat', countryCode: 'OM', countryName: 'Oman', iataCityCode: 'MCT', latitude: 23.588, longitude: 58.3829, timezone: 'Asia/Muscat', popularityScore: 76 },
  { code: 'BAH', type: 'CITY', name: 'Manama', cityName: 'Manama', countryCode: 'BH', countryName: 'Bahrain', iataCityCode: 'BAH', latitude: 26.2285, longitude: 50.586, timezone: 'Asia/Bahrain', popularityScore: 75 },
  { code: 'KWI', type: 'CITY', name: 'Kuwait City', cityName: 'Kuwait City', countryCode: 'KW', countryName: 'Kuwait', iataCityCode: 'KWI', latitude: 29.3759, longitude: 47.9774, timezone: 'Asia/Kuwait', popularityScore: 77 },
  { code: 'AMM', type: 'CITY', name: 'Amman', cityName: 'Amman', countryCode: 'JO', countryName: 'Jordan', iataCityCode: 'AMM', latitude: 31.9454, longitude: 35.9284, timezone: 'Asia/Amman', popularityScore: 76 },
  { code: 'BEY', type: 'CITY', name: 'Beirut', cityName: 'Beirut', countryCode: 'LB', countryName: 'Lebanon', iataCityCode: 'BEY', latitude: 33.8938, longitude: 35.5018, timezone: 'Asia/Beirut', popularityScore: 74 },

  // ── South Asia cities ───────────────────────────────────
  { code: 'BLR', type: 'CITY', name: 'Bangalore', cityName: 'Bangalore', countryCode: 'IN', countryName: 'India', iataCityCode: 'BLR', latitude: 12.9716, longitude: 77.5946, timezone: 'Asia/Kolkata', popularityScore: 82 },
  { code: 'HYD', type: 'CITY', name: 'Hyderabad', cityName: 'Hyderabad', countryCode: 'IN', countryName: 'India', iataCityCode: 'HYD', latitude: 17.385, longitude: 78.4867, timezone: 'Asia/Kolkata', popularityScore: 78 },
  { code: 'CCU', type: 'CITY', name: 'Kolkata', cityName: 'Kolkata', countryCode: 'IN', countryName: 'India', iataCityCode: 'CCU', latitude: 22.5726, longitude: 88.3639, timezone: 'Asia/Kolkata', popularityScore: 77 },
  { code: 'CMB', type: 'CITY', name: 'Colombo', cityName: 'Colombo', countryCode: 'LK', countryName: 'Sri Lanka', iataCityCode: 'CMB', latitude: 6.9271, longitude: 79.8612, timezone: 'Asia/Colombo', popularityScore: 76 },
  { code: 'KTM', type: 'CITY', name: 'Kathmandu', cityName: 'Kathmandu', countryCode: 'NP', countryName: 'Nepal', iataCityCode: 'KTM', latitude: 27.7172, longitude: 85.324, timezone: 'Asia/Kathmandu', popularityScore: 73 },
  { code: 'DAC', type: 'CITY', name: 'Dhaka', cityName: 'Dhaka', countryCode: 'BD', countryName: 'Bangladesh', iataCityCode: 'DAC', latitude: 23.8103, longitude: 90.4125, timezone: 'Asia/Dhaka', popularityScore: 78 },

  // ── Southeast Asia cities ───────────────────────────────
  { code: 'MNL', type: 'CITY', name: 'Manila', cityName: 'Manila', countryCode: 'PH', countryName: 'Philippines', iataCityCode: 'MNL', latitude: 14.5995, longitude: 120.9842, timezone: 'Asia/Manila', popularityScore: 82 },
  { code: 'SGN', type: 'CITY', name: 'Ho Chi Minh City', cityName: 'Ho Chi Minh City', countryCode: 'VN', countryName: 'Vietnam', iataCityCode: 'SGN', latitude: 10.8231, longitude: 106.6297, timezone: 'Asia/Ho_Chi_Minh', popularityScore: 80 },
  { code: 'JKT', type: 'CITY', name: 'Jakarta', cityName: 'Jakarta', countryCode: 'ID', countryName: 'Indonesia', iataCityCode: 'JKT', latitude: -6.2088, longitude: 106.8456, timezone: 'Asia/Jakarta', popularityScore: 83 },
  { code: 'DPS', type: 'CITY', name: 'Bali / Denpasar', cityName: 'Bali', countryCode: 'ID', countryName: 'Indonesia', iataCityCode: 'DPS', latitude: -8.65, longitude: 115.2167, timezone: 'Asia/Makassar', popularityScore: 82 },
  { code: 'HAN', type: 'CITY', name: 'Hanoi', cityName: 'Hanoi', countryCode: 'VN', countryName: 'Vietnam', iataCityCode: 'HAN', latitude: 21.0278, longitude: 105.8342, timezone: 'Asia/Ho_Chi_Minh', popularityScore: 78 },
  { code: 'PNH', type: 'CITY', name: 'Phnom Penh', cityName: 'Phnom Penh', countryCode: 'KH', countryName: 'Cambodia', iataCityCode: 'PNH', latitude: 11.5564, longitude: 104.9282, timezone: 'Asia/Phnom_Penh', popularityScore: 71 },
  { code: 'RGN', type: 'CITY', name: 'Yangon', cityName: 'Yangon', countryCode: 'MM', countryName: 'Myanmar', iataCityCode: 'RGN', latitude: 16.8661, longitude: 96.1951, timezone: 'Asia/Yangon', popularityScore: 70 },

  // ── East Asia cities ────────────────────────────────────
  { code: 'BJS', type: 'CITY', name: 'Beijing', cityName: 'Beijing', countryCode: 'CN', countryName: 'China', iataCityCode: 'BJS', latitude: 39.9042, longitude: 116.4074, timezone: 'Asia/Shanghai', popularityScore: 92 },
  { code: 'SHA', type: 'CITY', name: 'Shanghai', cityName: 'Shanghai', countryCode: 'CN', countryName: 'China', iataCityCode: 'SHA', latitude: 31.2304, longitude: 121.4737, timezone: 'Asia/Shanghai', popularityScore: 91 },
  { code: 'TPE', type: 'CITY', name: 'Taipei', cityName: 'Taipei', countryCode: 'TW', countryName: 'Taiwan', iataCityCode: 'TPE', latitude: 25.033, longitude: 121.5654, timezone: 'Asia/Taipei', popularityScore: 82 },

  // ── Africa cities ───────────────────────────────────────
  { code: 'JNB', type: 'CITY', name: 'Johannesburg', cityName: 'Johannesburg', countryCode: 'ZA', countryName: 'South Africa', iataCityCode: 'JNB', latitude: -26.2041, longitude: 28.0473, timezone: 'Africa/Johannesburg', popularityScore: 80 },
  { code: 'CPT', type: 'CITY', name: 'Cape Town', cityName: 'Cape Town', countryCode: 'ZA', countryName: 'South Africa', iataCityCode: 'CPT', latitude: -33.9249, longitude: 18.4241, timezone: 'Africa/Johannesburg', popularityScore: 78 },
  { code: 'NBO', type: 'CITY', name: 'Nairobi', cityName: 'Nairobi', countryCode: 'KE', countryName: 'Kenya', iataCityCode: 'NBO', latitude: -1.2921, longitude: 36.8219, timezone: 'Africa/Nairobi', popularityScore: 76 },
  { code: 'LOS', type: 'CITY', name: 'Lagos', cityName: 'Lagos', countryCode: 'NG', countryName: 'Nigeria', iataCityCode: 'LOS', latitude: 6.5244, longitude: 3.3792, timezone: 'Africa/Lagos', popularityScore: 77 },
  { code: 'ACC', type: 'CITY', name: 'Accra', cityName: 'Accra', countryCode: 'GH', countryName: 'Ghana', iataCityCode: 'ACC', latitude: 5.6037, longitude: -0.187, timezone: 'Africa/Accra', popularityScore: 71 },
  { code: 'ADD', type: 'CITY', name: 'Addis Ababa', cityName: 'Addis Ababa', countryCode: 'ET', countryName: 'Ethiopia', iataCityCode: 'ADD', latitude: 9.025, longitude: 38.7469, timezone: 'Africa/Addis_Ababa', popularityScore: 73 },
  { code: 'CMN', type: 'CITY', name: 'Casablanca', cityName: 'Casablanca', countryCode: 'MA', countryName: 'Morocco', iataCityCode: 'CMN', latitude: 33.5731, longitude: -7.5898, timezone: 'Africa/Casablanca', popularityScore: 74 },

  // ── Latin America cities ────────────────────────────────
  { code: 'SAO', type: 'CITY', name: 'São Paulo', cityName: 'São Paulo', countryCode: 'BR', countryName: 'Brazil', iataCityCode: 'SAO', latitude: -23.5505, longitude: -46.6333, timezone: 'America/Sao_Paulo', popularityScore: 87 },
  { code: 'BUE', type: 'CITY', name: 'Buenos Aires', cityName: 'Buenos Aires', countryCode: 'AR', countryName: 'Argentina', iataCityCode: 'BUE', latitude: -34.6037, longitude: -58.3816, timezone: 'America/Argentina/Buenos_Aires', popularityScore: 83 },
  { code: 'LIM', type: 'CITY', name: 'Lima', cityName: 'Lima', countryCode: 'PE', countryName: 'Peru', iataCityCode: 'LIM', latitude: -12.0464, longitude: -77.0428, timezone: 'America/Lima', popularityScore: 77 },
  { code: 'BOG', type: 'CITY', name: 'Bogota', cityName: 'Bogota', countryCode: 'CO', countryName: 'Colombia', iataCityCode: 'BOG', latitude: 4.711, longitude: -74.0721, timezone: 'America/Bogota', popularityScore: 78 },
  { code: 'SCL', type: 'CITY', name: 'Santiago', cityName: 'Santiago', countryCode: 'CL', countryName: 'Chile', iataCityCode: 'SCL', latitude: -33.4489, longitude: -70.6693, timezone: 'America/Santiago', popularityScore: 77 },

  // ── Europe secondary cities ─────────────────────────────
  { code: 'PRG', type: 'CITY', name: 'Prague', cityName: 'Prague', countryCode: 'CZ', countryName: 'Czech Republic', iataCityCode: 'PRG', latitude: 50.0755, longitude: 14.4378, timezone: 'Europe/Prague', popularityScore: 79 },
  { code: 'BUD', type: 'CITY', name: 'Budapest', cityName: 'Budapest', countryCode: 'HU', countryName: 'Hungary', iataCityCode: 'BUD', latitude: 47.4979, longitude: 19.0402, timezone: 'Europe/Budapest', popularityScore: 78 },
  { code: 'WAW', type: 'CITY', name: 'Warsaw', cityName: 'Warsaw', countryCode: 'PL', countryName: 'Poland', iataCityCode: 'WAW', latitude: 52.2297, longitude: 21.0122, timezone: 'Europe/Warsaw', popularityScore: 76 },
  { code: 'KRK', type: 'CITY', name: 'Krakow', cityName: 'Krakow', countryCode: 'PL', countryName: 'Poland', iataCityCode: 'KRK', latitude: 50.0647, longitude: 19.945, timezone: 'Europe/Warsaw', popularityScore: 74 },
  { code: 'CPH', type: 'CITY', name: 'Copenhagen', cityName: 'Copenhagen', countryCode: 'DK', countryName: 'Denmark', iataCityCode: 'CPH', latitude: 55.6761, longitude: 12.5683, timezone: 'Europe/Copenhagen', popularityScore: 80 },
  { code: 'STO', type: 'CITY', name: 'Stockholm', cityName: 'Stockholm', countryCode: 'SE', countryName: 'Sweden', iataCityCode: 'STO', latitude: 59.3293, longitude: 18.0686, timezone: 'Europe/Stockholm', popularityScore: 79 },
  { code: 'OSL', type: 'CITY', name: 'Oslo', cityName: 'Oslo', countryCode: 'NO', countryName: 'Norway', iataCityCode: 'OSL', latitude: 59.9139, longitude: 10.7522, timezone: 'Europe/Oslo', popularityScore: 78 },
  { code: 'HEL', type: 'CITY', name: 'Helsinki', cityName: 'Helsinki', countryCode: 'FI', countryName: 'Finland', iataCityCode: 'HEL', latitude: 60.1699, longitude: 24.9384, timezone: 'Europe/Helsinki', popularityScore: 75 },
  { code: 'DUB', type: 'CITY', name: 'Dublin', cityName: 'Dublin', countryCode: 'IE', countryName: 'Ireland', iataCityCode: 'DUB', latitude: 53.3498, longitude: -6.2603, timezone: 'Europe/Dublin', popularityScore: 80 },
  { code: 'REK', type: 'CITY', name: 'Reykjavik', cityName: 'Reykjavik', countryCode: 'IS', countryName: 'Iceland', iataCityCode: 'REK', latitude: 64.1466, longitude: -21.9426, timezone: 'Atlantic/Reykjavik', popularityScore: 70 },
  { code: 'BUH', type: 'CITY', name: 'Bucharest', cityName: 'Bucharest', countryCode: 'RO', countryName: 'Romania', iataCityCode: 'BUH', latitude: 44.4268, longitude: 26.1025, timezone: 'Europe/Bucharest', popularityScore: 73 },
  { code: 'BEG', type: 'CITY', name: 'Belgrade', cityName: 'Belgrade', countryCode: 'RS', countryName: 'Serbia', iataCityCode: 'BEG', latitude: 44.7866, longitude: 20.4489, timezone: 'Europe/Belgrade', popularityScore: 72 },

  // ── Oceania cities ──────────────────────────────────────
  { code: 'AKL', type: 'CITY', name: 'Auckland', cityName: 'Auckland', countryCode: 'NZ', countryName: 'New Zealand', iataCityCode: 'AKL', latitude: -36.8485, longitude: 174.7633, timezone: 'Pacific/Auckland', popularityScore: 76 },
  { code: 'BNE', type: 'CITY', name: 'Brisbane', cityName: 'Brisbane', countryCode: 'AU', countryName: 'Australia', iataCityCode: 'BNE', latitude: -27.4698, longitude: 153.0251, timezone: 'Australia/Brisbane', popularityScore: 74 },

  // ── USA secondary cities ────────────────────────────────
  { code: 'HOU', type: 'CITY', name: 'Houston', cityName: 'Houston', countryCode: 'US', countryName: 'United States', iataCityCode: 'HOU', latitude: 29.7604, longitude: -95.3698, timezone: 'America/Chicago', popularityScore: 82 },
  { code: 'DFW', type: 'CITY', name: 'Dallas', cityName: 'Dallas', countryCode: 'US', countryName: 'United States', iataCityCode: 'DFW', latitude: 32.7767, longitude: -96.797, timezone: 'America/Chicago', popularityScore: 81 },
  { code: 'WAS', type: 'CITY', name: 'Washington', cityName: 'Washington', countryCode: 'US', countryName: 'United States', iataCityCode: 'WAS', latitude: 38.9072, longitude: -77.0369, timezone: 'America/New_York', popularityScore: 83 },
  { code: 'BOS', type: 'CITY', name: 'Boston', cityName: 'Boston', countryCode: 'US', countryName: 'United States', iataCityCode: 'BOS', latitude: 42.3601, longitude: -71.0589, timezone: 'America/New_York', popularityScore: 80 },
  { code: 'SEA', type: 'CITY', name: 'Seattle', cityName: 'Seattle', countryCode: 'US', countryName: 'United States', iataCityCode: 'SEA', latitude: 47.6062, longitude: -122.3321, timezone: 'America/Los_Angeles', popularityScore: 81 },
  { code: 'DEN', type: 'CITY', name: 'Denver', cityName: 'Denver', countryCode: 'US', countryName: 'United States', iataCityCode: 'DEN', latitude: 39.7392, longitude: -104.9903, timezone: 'America/Denver', popularityScore: 78 },
  { code: 'ATL', type: 'CITY', name: 'Atlanta', cityName: 'Atlanta', countryCode: 'US', countryName: 'United States', iataCityCode: 'ATL', latitude: 33.749, longitude: -84.388, timezone: 'America/New_York', popularityScore: 82 },
  { code: 'MSP', type: 'CITY', name: 'Minneapolis', cityName: 'Minneapolis', countryCode: 'US', countryName: 'United States', iataCityCode: 'MSP', latitude: 44.9778, longitude: -93.265, timezone: 'America/Chicago', popularityScore: 76 },
  { code: 'PHL', type: 'CITY', name: 'Philadelphia', cityName: 'Philadelphia', countryCode: 'US', countryName: 'United States', iataCityCode: 'PHL', latitude: 39.9526, longitude: -75.1652, timezone: 'America/New_York', popularityScore: 78 },
  { code: 'PHX', type: 'CITY', name: 'Phoenix', cityName: 'Phoenix', countryCode: 'US', countryName: 'United States', iataCityCode: 'PHX', latitude: 33.4484, longitude: -112.074, timezone: 'America/Phoenix', popularityScore: 77 },
  { code: 'SAN', type: 'CITY', name: 'San Diego', cityName: 'San Diego', countryCode: 'US', countryName: 'United States', iataCityCode: 'SAN', latitude: 32.7157, longitude: -117.1611, timezone: 'America/Los_Angeles', popularityScore: 75 },
  { code: 'DTW', type: 'CITY', name: 'Detroit', cityName: 'Detroit', countryCode: 'US', countryName: 'United States', iataCityCode: 'DTW', latitude: 42.3314, longitude: -83.0458, timezone: 'America/New_York', popularityScore: 75 },
  { code: 'AUS', type: 'CITY', name: 'Austin', cityName: 'Austin', countryCode: 'US', countryName: 'United States', iataCityCode: 'AUS', latitude: 30.2672, longitude: -97.7431, timezone: 'America/Chicago', popularityScore: 76 },

  // ── AIRPORTS ───────────────────────────────────────────
  { code: 'KHI', type: 'AIRPORT', name: 'Jinnah International', cityName: 'Karachi', countryCode: 'PK', countryName: 'Pakistan', iataCityCode: 'KHI', latitude: 24.9065, longitude: 67.1609, timezone: 'Asia/Karachi', popularityScore: 88 },
  { code: 'DXB', type: 'AIRPORT', name: 'Dubai International', cityName: 'Dubai', countryCode: 'AE', countryName: 'United Arab Emirates', iataCityCode: 'DXB', latitude: 25.2532, longitude: 55.3657, timezone: 'Asia/Dubai', popularityScore: 95 },
  { code: 'DOH', type: 'AIRPORT', name: 'Hamad International', cityName: 'Doha', countryCode: 'QA', countryName: 'Qatar', iataCityCode: 'DOH', latitude: 25.2731, longitude: 51.6082, timezone: 'Asia/Qatar', popularityScore: 87 },
  { code: 'AUH', type: 'AIRPORT', name: 'Zayed International', cityName: 'Abu Dhabi', countryCode: 'AE', countryName: 'United Arab Emirates', iataCityCode: 'AUH', latitude: 24.433, longitude: 54.6511, timezone: 'Asia/Dubai', popularityScore: 86 },
  { code: 'ISB', type: 'AIRPORT', name: 'Islamabad International', cityName: 'Islamabad', countryCode: 'PK', countryName: 'Pakistan', iataCityCode: 'ISB', latitude: 33.6167, longitude: 73.0991, timezone: 'Asia/Karachi', popularityScore: 80 },
  { code: 'LHE', type: 'AIRPORT', name: 'Allama Iqbal International', cityName: 'Lahore', countryCode: 'PK', countryName: 'Pakistan', iataCityCode: 'LHE', latitude: 31.5216, longitude: 74.4036, timezone: 'Asia/Karachi', popularityScore: 79 },
  { code: 'RUH', type: 'AIRPORT', name: 'King Khalid International', cityName: 'Riyadh', countryCode: 'SA', countryName: 'Saudi Arabia', iataCityCode: 'RUH', latitude: 24.9576, longitude: 46.6988, timezone: 'Asia/Riyadh', popularityScore: 82 },
  { code: 'JED', type: 'AIRPORT', name: 'King Abdulaziz International', cityName: 'Jeddah', countryCode: 'SA', countryName: 'Saudi Arabia', iataCityCode: 'JED', latitude: 21.6796, longitude: 39.1565, timezone: 'Asia/Riyadh', popularityScore: 79 },
  { code: 'LHR', type: 'AIRPORT', name: 'Heathrow', cityName: 'London', countryCode: 'GB', countryName: 'United Kingdom', iataCityCode: 'LON', latitude: 51.47, longitude: -0.4543, timezone: 'Europe/London', popularityScore: 94 },
  { code: 'LGW', type: 'AIRPORT', name: 'Gatwick', cityName: 'London', countryCode: 'GB', countryName: 'United Kingdom', iataCityCode: 'LON', latitude: 51.1537, longitude: -0.1821, timezone: 'Europe/London', popularityScore: 87 },
  { code: 'STN', type: 'AIRPORT', name: 'London Stansted', cityName: 'London', countryCode: 'GB', countryName: 'United Kingdom', iataCityCode: 'LON', latitude: 51.885, longitude: 0.235, timezone: 'Europe/London', popularityScore: 75 },
  { code: 'LTN', type: 'AIRPORT', name: 'London Luton', cityName: 'London', countryCode: 'GB', countryName: 'United Kingdom', iataCityCode: 'LON', latitude: 51.8747, longitude: -0.3683, timezone: 'Europe/London', popularityScore: 72 },
  { code: 'LCY', type: 'AIRPORT', name: 'London City', cityName: 'London', countryCode: 'GB', countryName: 'United Kingdom', iataCityCode: 'LON', latitude: 51.5053, longitude: 0.0553, timezone: 'Europe/London', popularityScore: 70 },
  { code: 'CDG', type: 'AIRPORT', name: 'Charles de Gaulle', cityName: 'Paris', countryCode: 'FR', countryName: 'France', iataCityCode: 'PAR', latitude: 49.0097, longitude: 2.5479, timezone: 'Europe/Paris', popularityScore: 93 },
  { code: 'ORY', type: 'AIRPORT', name: 'Paris Orly', cityName: 'Paris', countryCode: 'FR', countryName: 'France', iataCityCode: 'PAR', latitude: 48.7233, longitude: 2.3794, timezone: 'Europe/Paris', popularityScore: 80 },
  { code: 'FRA', type: 'AIRPORT', name: 'Frankfurt Airport', cityName: 'Frankfurt', countryCode: 'DE', countryName: 'Germany', iataCityCode: 'FRA', latitude: 50.0379, longitude: 8.5622, timezone: 'Europe/Berlin', popularityScore: 85 },
  { code: 'AMS', type: 'AIRPORT', name: 'Schiphol', cityName: 'Amsterdam', countryCode: 'NL', countryName: 'Netherlands', iataCityCode: 'AMS', latitude: 52.3105, longitude: 4.7683, timezone: 'Europe/Amsterdam', popularityScore: 84 },
  { code: 'IST', type: 'AIRPORT', name: 'Istanbul Airport', cityName: 'Istanbul', countryCode: 'TR', countryName: 'Turkey', iataCityCode: 'IST', latitude: 41.2753, longitude: 28.7519, timezone: 'Europe/Istanbul', popularityScore: 91 },
  { code: 'SAW', type: 'AIRPORT', name: 'Sabiha Gökçen', cityName: 'Istanbul', countryCode: 'TR', countryName: 'Turkey', iataCityCode: 'IST', latitude: 40.8986, longitude: 29.3092, timezone: 'Europe/Istanbul', popularityScore: 78 },
  { code: 'JFK', type: 'AIRPORT', name: 'John F. Kennedy', cityName: 'New York', countryCode: 'US', countryName: 'United States', iataCityCode: 'NYC', latitude: 40.6413, longitude: -73.7781, timezone: 'America/New_York', popularityScore: 92 },
  { code: 'EWR', type: 'AIRPORT', name: 'Newark Liberty', cityName: 'Newark', countryCode: 'US', countryName: 'United States', iataCityCode: 'NYC', latitude: 40.6895, longitude: -74.1745, timezone: 'America/New_York', popularityScore: 79 },
  { code: 'LAX', type: 'AIRPORT', name: 'Los Angeles International', cityName: 'Los Angeles', countryCode: 'US', countryName: 'United States', iataCityCode: 'LAX', latitude: 33.9425, longitude: -118.408, timezone: 'America/Los_Angeles', popularityScore: 87 },
  { code: 'ORD', type: 'AIRPORT', name: 'O\'Hare International', cityName: 'Chicago', countryCode: 'US', countryName: 'United States', iataCityCode: 'ORD', latitude: 41.9742, longitude: -87.9073, timezone: 'America/Chicago', popularityScore: 81 },
  { code: 'YYZ', type: 'AIRPORT', name: 'Pearson International', cityName: 'Toronto', countryCode: 'CA', countryName: 'Canada', iataCityCode: 'YYZ', latitude: 43.6777, longitude: -79.6248, timezone: 'America/Toronto', popularityScore: 82 },
  { code: 'SIN', type: 'AIRPORT', name: 'Changi', cityName: 'Singapore', countryCode: 'SG', countryName: 'Singapore', iataCityCode: 'SIN', latitude: 1.3644, longitude: 103.9915, timezone: 'Asia/Singapore', popularityScore: 90 },
  { code: 'HKG', type: 'AIRPORT', name: 'Hong Kong International', cityName: 'Hong Kong', countryCode: 'HK', countryName: 'Hong Kong', iataCityCode: 'HKG', latitude: 22.308, longitude: 113.9185, timezone: 'Asia/Hong_Kong', popularityScore: 88 },
  { code: 'BKK', type: 'AIRPORT', name: 'Suvarnabhumi', cityName: 'Bangkok', countryCode: 'TH', countryName: 'Thailand', iataCityCode: 'BKK', latitude: 13.6900, longitude: 100.7501, timezone: 'Asia/Bangkok', popularityScore: 89 },
  { code: 'KUL', type: 'AIRPORT', name: 'Kuala Lumpur International', cityName: 'Kuala Lumpur', countryCode: 'MY', countryName: 'Malaysia', iataCityCode: 'KUL', latitude: 2.7456, longitude: 101.7099, timezone: 'Asia/Kuala_Lumpur', popularityScore: 83 },
  { code: 'DEL', type: 'AIRPORT', name: 'Indira Gandhi International', cityName: 'New Delhi', countryCode: 'IN', countryName: 'India', iataCityCode: 'DEL', latitude: 28.5562, longitude: 77.1000, timezone: 'Asia/Kolkata', popularityScore: 86 },
  { code: 'BOM', type: 'AIRPORT', name: 'Chhatrapati Shivaji Maharaj', cityName: 'Mumbai', countryCode: 'IN', countryName: 'India', iataCityCode: 'BOM', latitude: 19.0896, longitude: 72.8656, timezone: 'Asia/Kolkata', popularityScore: 84 },
  { code: 'SYD', type: 'AIRPORT', name: 'Kingsford Smith', cityName: 'Sydney', countryCode: 'AU', countryName: 'Australia', iataCityCode: 'SYD', latitude: -33.9461, longitude: 151.1772, timezone: 'Australia/Sydney', popularityScore: 85 },
  { code: 'MEL', type: 'AIRPORT', name: 'Melbourne Airport', cityName: 'Melbourne', countryCode: 'AU', countryName: 'Australia', iataCityCode: 'MEL', latitude: -37.669, longitude: 144.841, timezone: 'Australia/Melbourne', popularityScore: 79 },
  { code: 'BCN', type: 'AIRPORT', name: 'Barcelona–El Prat', cityName: 'Barcelona', countryCode: 'ES', countryName: 'Spain', iataCityCode: 'BCN', latitude: 41.2974, longitude: 2.0833, timezone: 'Europe/Madrid', popularityScore: 90 },
  { code: 'MLE', type: 'AIRPORT', name: 'Velana International', cityName: 'Malé', countryCode: 'MV', countryName: 'Maldives', iataCityCode: 'MLE', latitude: 4.1918, longitude: 73.5290, timezone: 'Indian/Maldives', popularityScore: 77 },
  { code: 'CAI', type: 'AIRPORT', name: 'Cairo International', cityName: 'Cairo', countryCode: 'EG', countryName: 'Egypt', iataCityCode: 'CAI', latitude: 30.1219, longitude: 31.4056, timezone: 'Africa/Cairo', popularityScore: 78 },
  { code: 'NRT', type: 'AIRPORT', name: 'Narita International', cityName: 'Tokyo', countryCode: 'JP', countryName: 'Japan', iataCityCode: 'TYO', latitude: 35.7647, longitude: 140.3864, timezone: 'Asia/Tokyo', popularityScore: 87 },
  { code: 'HND', type: 'AIRPORT', name: 'Haneda', cityName: 'Tokyo', countryCode: 'JP', countryName: 'Japan', iataCityCode: 'TYO', latitude: 35.5494, longitude: 139.7798, timezone: 'Asia/Tokyo', popularityScore: 86 },
  { code: 'ICN', type: 'AIRPORT', name: 'Incheon International', cityName: 'Seoul', countryCode: 'KR', countryName: 'South Korea', iataCityCode: 'SEL', latitude: 37.4602, longitude: 126.4407, timezone: 'Asia/Seoul', popularityScore: 84 },

  // ── Middle East airports ────────────────────────────────
  { code: 'MCT', type: 'AIRPORT', name: 'Muscat International', cityName: 'Muscat', countryCode: 'OM', countryName: 'Oman', iataCityCode: 'MCT', latitude: 23.5933, longitude: 58.2844, timezone: 'Asia/Muscat', popularityScore: 75 },
  { code: 'BAH', type: 'AIRPORT', name: 'Bahrain International', cityName: 'Manama', countryCode: 'BH', countryName: 'Bahrain', iataCityCode: 'BAH', latitude: 26.2708, longitude: 50.6336, timezone: 'Asia/Bahrain', popularityScore: 74 },
  { code: 'KWI', type: 'AIRPORT', name: 'Kuwait International', cityName: 'Kuwait City', countryCode: 'KW', countryName: 'Kuwait', iataCityCode: 'KWI', latitude: 29.2266, longitude: 47.9689, timezone: 'Asia/Kuwait', popularityScore: 76 },
  { code: 'AMM', type: 'AIRPORT', name: 'Queen Alia International', cityName: 'Amman', countryCode: 'JO', countryName: 'Jordan', iataCityCode: 'AMM', latitude: 31.7226, longitude: 35.9932, timezone: 'Asia/Amman', popularityScore: 75 },
  { code: 'BEY', type: 'AIRPORT', name: 'Rafic Hariri International', cityName: 'Beirut', countryCode: 'LB', countryName: 'Lebanon', iataCityCode: 'BEY', latitude: 33.8209, longitude: 35.4884, timezone: 'Asia/Beirut', popularityScore: 73 },
  { code: 'DMM', type: 'AIRPORT', name: 'King Fahd International', cityName: 'Dammam', countryCode: 'SA', countryName: 'Saudi Arabia', iataCityCode: 'DMM', latitude: 26.4712, longitude: 49.7979, timezone: 'Asia/Riyadh', popularityScore: 77 },

  // ── South Asia airports ─────────────────────────────────
  { code: 'BLR', type: 'AIRPORT', name: 'Kempegowda International', cityName: 'Bangalore', countryCode: 'IN', countryName: 'India', iataCityCode: 'BLR', latitude: 13.1986, longitude: 77.7066, timezone: 'Asia/Kolkata', popularityScore: 81 },
  { code: 'HYD', type: 'AIRPORT', name: 'Rajiv Gandhi International', cityName: 'Hyderabad', countryCode: 'IN', countryName: 'India', iataCityCode: 'HYD', latitude: 17.2403, longitude: 78.4294, timezone: 'Asia/Kolkata', popularityScore: 77 },
  { code: 'CCU', type: 'AIRPORT', name: 'Netaji Subhas Chandra Bose International', cityName: 'Kolkata', countryCode: 'IN', countryName: 'India', iataCityCode: 'CCU', latitude: 22.6547, longitude: 88.4467, timezone: 'Asia/Kolkata', popularityScore: 76 },
  { code: 'CMB', type: 'AIRPORT', name: 'Bandaranaike International', cityName: 'Colombo', countryCode: 'LK', countryName: 'Sri Lanka', iataCityCode: 'CMB', latitude: 7.1808, longitude: 79.8841, timezone: 'Asia/Colombo', popularityScore: 75 },
  { code: 'KTM', type: 'AIRPORT', name: 'Tribhuvan International', cityName: 'Kathmandu', countryCode: 'NP', countryName: 'Nepal', iataCityCode: 'KTM', latitude: 27.6966, longitude: 85.3591, timezone: 'Asia/Kathmandu', popularityScore: 72 },
  { code: 'DAC', type: 'AIRPORT', name: 'Hazrat Shahjalal International', cityName: 'Dhaka', countryCode: 'BD', countryName: 'Bangladesh', iataCityCode: 'DAC', latitude: 23.8433, longitude: 90.3978, timezone: 'Asia/Dhaka', popularityScore: 77 },

  // ── Southeast Asia airports ─────────────────────────────
  { code: 'MNL', type: 'AIRPORT', name: 'Ninoy Aquino International', cityName: 'Manila', countryCode: 'PH', countryName: 'Philippines', iataCityCode: 'MNL', latitude: 14.5086, longitude: 121.0197, timezone: 'Asia/Manila', popularityScore: 81 },
  { code: 'SGN', type: 'AIRPORT', name: 'Tan Son Nhat International', cityName: 'Ho Chi Minh City', countryCode: 'VN', countryName: 'Vietnam', iataCityCode: 'SGN', latitude: 10.8188, longitude: 106.652, timezone: 'Asia/Ho_Chi_Minh', popularityScore: 79 },
  { code: 'CGK', type: 'AIRPORT', name: 'Soekarno-Hatta International', cityName: 'Jakarta', countryCode: 'ID', countryName: 'Indonesia', iataCityCode: 'JKT', latitude: -6.1256, longitude: 106.6559, timezone: 'Asia/Jakarta', popularityScore: 82 },
  { code: 'DPS', type: 'AIRPORT', name: 'Ngurah Rai International', cityName: 'Bali', countryCode: 'ID', countryName: 'Indonesia', iataCityCode: 'DPS', latitude: -8.7482, longitude: 115.1672, timezone: 'Asia/Makassar', popularityScore: 81 },
  { code: 'HAN', type: 'AIRPORT', name: 'Noi Bai International', cityName: 'Hanoi', countryCode: 'VN', countryName: 'Vietnam', iataCityCode: 'HAN', latitude: 21.2212, longitude: 105.807, timezone: 'Asia/Ho_Chi_Minh', popularityScore: 77 },
  { code: 'PNH', type: 'AIRPORT', name: 'Phnom Penh International', cityName: 'Phnom Penh', countryCode: 'KH', countryName: 'Cambodia', iataCityCode: 'PNH', latitude: 11.5466, longitude: 104.8441, timezone: 'Asia/Phnom_Penh', popularityScore: 70 },
  { code: 'RGN', type: 'AIRPORT', name: 'Yangon International', cityName: 'Yangon', countryCode: 'MM', countryName: 'Myanmar', iataCityCode: 'RGN', latitude: 16.9074, longitude: 96.1332, timezone: 'Asia/Yangon', popularityScore: 69 },

  // ── East Asia airports ──────────────────────────────────
  { code: 'PEK', type: 'AIRPORT', name: 'Beijing Capital International', cityName: 'Beijing', countryCode: 'CN', countryName: 'China', iataCityCode: 'BJS', latitude: 40.0799, longitude: 116.6031, timezone: 'Asia/Shanghai', popularityScore: 91 },
  { code: 'PKX', type: 'AIRPORT', name: 'Beijing Daxing International', cityName: 'Beijing', countryCode: 'CN', countryName: 'China', iataCityCode: 'BJS', latitude: 39.5098, longitude: 116.4105, timezone: 'Asia/Shanghai', popularityScore: 88 },
  { code: 'PVG', type: 'AIRPORT', name: 'Shanghai Pudong International', cityName: 'Shanghai', countryCode: 'CN', countryName: 'China', iataCityCode: 'SHA', latitude: 31.1443, longitude: 121.8083, timezone: 'Asia/Shanghai', popularityScore: 90 },
  { code: 'SHA', type: 'AIRPORT', name: 'Shanghai Hongqiao International', cityName: 'Shanghai', countryCode: 'CN', countryName: 'China', iataCityCode: 'SHA', latitude: 31.1979, longitude: 121.3363, timezone: 'Asia/Shanghai', popularityScore: 85 },
  { code: 'TPE', type: 'AIRPORT', name: 'Taoyuan International', cityName: 'Taipei', countryCode: 'TW', countryName: 'Taiwan', iataCityCode: 'TPE', latitude: 25.0777, longitude: 121.2325, timezone: 'Asia/Taipei', popularityScore: 81 },

  // ── Africa airports ─────────────────────────────────────
  { code: 'JNB', type: 'AIRPORT', name: 'O.R. Tambo International', cityName: 'Johannesburg', countryCode: 'ZA', countryName: 'South Africa', iataCityCode: 'JNB', latitude: -26.1367, longitude: 28.2411, timezone: 'Africa/Johannesburg', popularityScore: 79 },
  { code: 'CPT', type: 'AIRPORT', name: 'Cape Town International', cityName: 'Cape Town', countryCode: 'ZA', countryName: 'South Africa', iataCityCode: 'CPT', latitude: -33.9649, longitude: 18.6017, timezone: 'Africa/Johannesburg', popularityScore: 77 },
  { code: 'NBO', type: 'AIRPORT', name: 'Jomo Kenyatta International', cityName: 'Nairobi', countryCode: 'KE', countryName: 'Kenya', iataCityCode: 'NBO', latitude: -1.3192, longitude: 36.9278, timezone: 'Africa/Nairobi', popularityScore: 75 },
  { code: 'LOS', type: 'AIRPORT', name: 'Murtala Muhammed International', cityName: 'Lagos', countryCode: 'NG', countryName: 'Nigeria', iataCityCode: 'LOS', latitude: 6.5774, longitude: 3.3212, timezone: 'Africa/Lagos', popularityScore: 76 },
  { code: 'ACC', type: 'AIRPORT', name: 'Kotoka International', cityName: 'Accra', countryCode: 'GH', countryName: 'Ghana', iataCityCode: 'ACC', latitude: 5.6052, longitude: -0.1668, timezone: 'Africa/Accra', popularityScore: 70 },
  { code: 'ADD', type: 'AIRPORT', name: 'Bole International', cityName: 'Addis Ababa', countryCode: 'ET', countryName: 'Ethiopia', iataCityCode: 'ADD', latitude: 8.9779, longitude: 38.7993, timezone: 'Africa/Addis_Ababa', popularityScore: 72 },

  // ── Latin America airports ──────────────────────────────
  { code: 'GRU', type: 'AIRPORT', name: 'São Paulo–Guarulhos International', cityName: 'São Paulo', countryCode: 'BR', countryName: 'Brazil', iataCityCode: 'SAO', latitude: -23.4356, longitude: -46.4731, timezone: 'America/Sao_Paulo', popularityScore: 86 },
  { code: 'EZE', type: 'AIRPORT', name: 'Ministro Pistarini International', cityName: 'Buenos Aires', countryCode: 'AR', countryName: 'Argentina', iataCityCode: 'BUE', latitude: -34.8222, longitude: -58.5358, timezone: 'America/Argentina/Buenos_Aires', popularityScore: 82 },
  { code: 'LIM', type: 'AIRPORT', name: 'Jorge Chávez International', cityName: 'Lima', countryCode: 'PE', countryName: 'Peru', iataCityCode: 'LIM', latitude: -12.0219, longitude: -77.1143, timezone: 'America/Lima', popularityScore: 76 },
  { code: 'BOG', type: 'AIRPORT', name: 'El Dorado International', cityName: 'Bogota', countryCode: 'CO', countryName: 'Colombia', iataCityCode: 'BOG', latitude: 4.7016, longitude: -74.1469, timezone: 'America/Bogota', popularityScore: 77 },
  { code: 'SCL', type: 'AIRPORT', name: 'Arturo Merino Benítez International', cityName: 'Santiago', countryCode: 'CL', countryName: 'Chile', iataCityCode: 'SCL', latitude: -33.393, longitude: -70.7858, timezone: 'America/Santiago', popularityScore: 76 },

  // ── Europe secondary airports ───────────────────────────
  { code: 'PRG', type: 'AIRPORT', name: 'Václav Havel Airport Prague', cityName: 'Prague', countryCode: 'CZ', countryName: 'Czech Republic', iataCityCode: 'PRG', latitude: 50.1008, longitude: 14.26, timezone: 'Europe/Prague', popularityScore: 78 },
  { code: 'BUD', type: 'AIRPORT', name: 'Budapest Ferenc Liszt International', cityName: 'Budapest', countryCode: 'HU', countryName: 'Hungary', iataCityCode: 'BUD', latitude: 47.4298, longitude: 19.2611, timezone: 'Europe/Budapest', popularityScore: 77 },
  { code: 'WAW', type: 'AIRPORT', name: 'Warsaw Chopin', cityName: 'Warsaw', countryCode: 'PL', countryName: 'Poland', iataCityCode: 'WAW', latitude: 52.1657, longitude: 20.9671, timezone: 'Europe/Warsaw', popularityScore: 75 },
  { code: 'KRK', type: 'AIRPORT', name: 'John Paul II International Airport Kraków–Balice', cityName: 'Krakow', countryCode: 'PL', countryName: 'Poland', iataCityCode: 'KRK', latitude: 50.0777, longitude: 19.7848, timezone: 'Europe/Warsaw', popularityScore: 73 },
  { code: 'CPH', type: 'AIRPORT', name: 'Copenhagen Airport', cityName: 'Copenhagen', countryCode: 'DK', countryName: 'Denmark', iataCityCode: 'CPH', latitude: 55.6181, longitude: 12.6561, timezone: 'Europe/Copenhagen', popularityScore: 79 },
  { code: 'ARN', type: 'AIRPORT', name: 'Stockholm Arlanda', cityName: 'Stockholm', countryCode: 'SE', countryName: 'Sweden', iataCityCode: 'STO', latitude: 59.6519, longitude: 17.9186, timezone: 'Europe/Stockholm', popularityScore: 78 },
  { code: 'OSL', type: 'AIRPORT', name: 'Oslo Gardermoen', cityName: 'Oslo', countryCode: 'NO', countryName: 'Norway', iataCityCode: 'OSL', latitude: 60.1976, longitude: 11.1004, timezone: 'Europe/Oslo', popularityScore: 77 },
  { code: 'HEL', type: 'AIRPORT', name: 'Helsinki-Vantaa', cityName: 'Helsinki', countryCode: 'FI', countryName: 'Finland', iataCityCode: 'HEL', latitude: 60.3172, longitude: 24.9633, timezone: 'Europe/Helsinki', popularityScore: 74 },
  { code: 'DUB', type: 'AIRPORT', name: 'Dublin Airport', cityName: 'Dublin', countryCode: 'IE', countryName: 'Ireland', iataCityCode: 'DUB', latitude: 53.4264, longitude: -6.2499, timezone: 'Europe/Dublin', popularityScore: 79 },
  { code: 'KEF', type: 'AIRPORT', name: 'Keflavík International', cityName: 'Reykjavik', countryCode: 'IS', countryName: 'Iceland', iataCityCode: 'REK', latitude: 63.985, longitude: -22.6056, timezone: 'Atlantic/Reykjavik', popularityScore: 69 },
  { code: 'OTP', type: 'AIRPORT', name: 'Henri Coandă International', cityName: 'Bucharest', countryCode: 'RO', countryName: 'Romania', iataCityCode: 'BUH', latitude: 44.5711, longitude: 26.085, timezone: 'Europe/Bucharest', popularityScore: 72 },
  { code: 'BEG', type: 'AIRPORT', name: 'Belgrade Nikola Tesla', cityName: 'Belgrade', countryCode: 'RS', countryName: 'Serbia', iataCityCode: 'BEG', latitude: 44.8184, longitude: 20.3091, timezone: 'Europe/Belgrade', popularityScore: 71 },

  // ── Oceania airports ────────────────────────────────────
  { code: 'AKL', type: 'AIRPORT', name: 'Auckland Airport', cityName: 'Auckland', countryCode: 'NZ', countryName: 'New Zealand', iataCityCode: 'AKL', latitude: -37.0082, longitude: 174.785, timezone: 'Pacific/Auckland', popularityScore: 75 },
  { code: 'BNE', type: 'AIRPORT', name: 'Brisbane Airport', cityName: 'Brisbane', countryCode: 'AU', countryName: 'Australia', iataCityCode: 'BNE', latitude: -27.3842, longitude: 153.1175, timezone: 'Australia/Brisbane', popularityScore: 73 },

  // ── USA secondary airports ──────────────────────────────
  { code: 'IAH', type: 'AIRPORT', name: 'George Bush Intercontinental', cityName: 'Houston', countryCode: 'US', countryName: 'United States', iataCityCode: 'HOU', latitude: 29.9844, longitude: -95.3414, timezone: 'America/Chicago', popularityScore: 81 },
  { code: 'DFW', type: 'AIRPORT', name: 'Dallas/Fort Worth International', cityName: 'Dallas', countryCode: 'US', countryName: 'United States', iataCityCode: 'DFW', latitude: 32.8998, longitude: -97.0403, timezone: 'America/Chicago', popularityScore: 80 },
  { code: 'DCA', type: 'AIRPORT', name: 'Ronald Reagan Washington National', cityName: 'Washington', countryCode: 'US', countryName: 'United States', iataCityCode: 'WAS', latitude: 38.8512, longitude: -77.0402, timezone: 'America/New_York', popularityScore: 79 },
  { code: 'IAD', type: 'AIRPORT', name: 'Washington Dulles International', cityName: 'Washington', countryCode: 'US', countryName: 'United States', iataCityCode: 'WAS', latitude: 38.9531, longitude: -77.4565, timezone: 'America/New_York', popularityScore: 78 },
  { code: 'BOS', type: 'AIRPORT', name: 'Boston Logan International', cityName: 'Boston', countryCode: 'US', countryName: 'United States', iataCityCode: 'BOS', latitude: 42.3656, longitude: -71.0096, timezone: 'America/New_York', popularityScore: 79 },
  { code: 'SEA', type: 'AIRPORT', name: 'Seattle-Tacoma International', cityName: 'Seattle', countryCode: 'US', countryName: 'United States', iataCityCode: 'SEA', latitude: 47.4502, longitude: -122.3088, timezone: 'America/Los_Angeles', popularityScore: 80 },
  { code: 'DEN', type: 'AIRPORT', name: 'Denver International', cityName: 'Denver', countryCode: 'US', countryName: 'United States', iataCityCode: 'DEN', latitude: 39.8561, longitude: -104.6737, timezone: 'America/Denver', popularityScore: 77 },
  { code: 'ATL', type: 'AIRPORT', name: 'Hartsfield-Jackson Atlanta International', cityName: 'Atlanta', countryCode: 'US', countryName: 'United States', iataCityCode: 'ATL', latitude: 33.6407, longitude: -84.4277, timezone: 'America/New_York', popularityScore: 81 },
  { code: 'MSP', type: 'AIRPORT', name: 'Minneapolis-Saint Paul International', cityName: 'Minneapolis', countryCode: 'US', countryName: 'United States', iataCityCode: 'MSP', latitude: 44.8848, longitude: -93.2223, timezone: 'America/Chicago', popularityScore: 75 },
  { code: 'PHL', type: 'AIRPORT', name: 'Philadelphia International', cityName: 'Philadelphia', countryCode: 'US', countryName: 'United States', iataCityCode: 'PHL', latitude: 39.8729, longitude: -75.2437, timezone: 'America/New_York', popularityScore: 77 },
  { code: 'PHX', type: 'AIRPORT', name: 'Phoenix Sky Harbor International', cityName: 'Phoenix', countryCode: 'US', countryName: 'United States', iataCityCode: 'PHX', latitude: 33.4373, longitude: -112.0078, timezone: 'America/Phoenix', popularityScore: 76 },
  { code: 'SAN', type: 'AIRPORT', name: 'San Diego International', cityName: 'San Diego', countryCode: 'US', countryName: 'United States', iataCityCode: 'SAN', latitude: 32.7338, longitude: -117.1933, timezone: 'America/Los_Angeles', popularityScore: 74 },
  { code: 'DTW', type: 'AIRPORT', name: 'Detroit Metropolitan Wayne County', cityName: 'Detroit', countryCode: 'US', countryName: 'United States', iataCityCode: 'DTW', latitude: 42.2124, longitude: -83.3534, timezone: 'America/New_York', popularityScore: 74 },
  { code: 'AUS', type: 'AIRPORT', name: 'Austin-Bergstrom International', cityName: 'Austin', countryCode: 'US', countryName: 'United States', iataCityCode: 'AUS', latitude: 30.1945, longitude: -97.6699, timezone: 'America/Chicago', popularityScore: 75 },
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);

  console.log(`Seeding ${LOCATIONS.length} flight locations...`);

  let created = 0;
  let updated = 0;

  for (const loc of LOCATIONS) {
    const result = await prisma.flightLocation.upsert({
      where: { code_type: { code: loc.code, type: loc.type } },
      create: {
        code: loc.code,
        type: loc.type,
        name: loc.name,
        cityName: loc.cityName,
        countryCode: loc.countryCode,
        countryName: loc.countryName,
        iataCityCode: loc.iataCityCode,
        latitude: loc.latitude,
        longitude: loc.longitude,
        timezone: loc.timezone,
        enabled: true,
        popularityScore: loc.popularityScore,
      },
      update: {
        type: loc.type,
        name: loc.name,
        cityName: loc.cityName,
        countryCode: loc.countryCode,
        countryName: loc.countryName,
        iataCityCode: loc.iataCityCode,
        latitude: loc.latitude,
        longitude: loc.longitude,
        timezone: loc.timezone,
        popularityScore: loc.popularityScore,
      },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created++;
    } else {
      updated++;
    }
  }

  console.log(`Done: ${created} created, ${updated} updated`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
