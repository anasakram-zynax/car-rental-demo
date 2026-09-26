// Hardcoded featured content for the homepage discovery sections.
// Replace with backend data once the API is ready.

function getDate(daysFromNow: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// City tabs (shared label set — each section picks which cities it supports)
// ---------------------------------------------------------------------------
export const cityTabs = [
  { label: 'All', value: 'all' },
  { label: 'Dubai', value: 'Dubai' },
  { label: 'Paris', value: 'Paris' },
  { label: 'Santorini', value: 'Santorini' },
  { label: 'Bali', value: 'Bali' },
  { label: 'Maldives', value: 'Maldives' },
  { label: 'Phuket', value: 'Phuket' },
  { label: 'Kyoto', value: 'Kyoto' },
  { label: 'Venice', value: 'Venice' },
] as const;

// ---------------------------------------------------------------------------
// Featured Hotels
// ---------------------------------------------------------------------------
export interface FeaturedHotel {
  id: string;
  title: string;
  destinationName: string;
  destinationCode: string;
  hotelName: string;
  location: string;
  image: string;
  discountLabel?: string;
  priceFrom: number;
  currency: string;
  rating: number;
  city: string;
}

export const featuredHotels: FeaturedHotel[] = [
  {
    id: 'atlantis-the-palm',
    title: 'Atlantis The Palm',
    destinationName: 'Dubai',
    destinationCode: 'DXB',
    hotelName: 'Atlantis The Palm',
    location: 'Palm Jumeirah, Dubai',
    image: '/images/home/hotels/atlantis-the-palm.webp',
    discountLabel: '15% OFF',
    priceFrom: 450,
    currency: 'USD',
    rating: 4.8,
    city: 'Dubai',
  },
  {
    id: 'ritz-carlton-newyork',
    title: 'The Ritz-Carlton New York',
    destinationName: 'New York',
    destinationCode: 'JFK',
    hotelName: 'The Ritz-Carlton New York',
    location: 'Central Park, New York',
    image: '/images/home/hotels/ritz-carlton-newyork.webp',
    priceFrom: 680,
    currency: 'USD',
    rating: 4.9,
    city: 'New York',
  },
  {
    id: 'w-barcelona',
    title: 'W Barcelona',
    destinationName: 'Barcelona',
    destinationCode: 'BCN',
    hotelName: 'W Barcelona',
    location: 'Barceloneta, Barcelona',
    image: '/images/home/hotels/w-barcelona.webp',
    discountLabel: '10% OFF',
    priceFrom: 320,
    currency: 'USD',
    rating: 4.7,
    city: 'Barcelona',
  },
  {
    id: 'park-hyatt-tokyo',
    title: 'Park Hyatt Tokyo',
    destinationName: 'Tokyo',
    destinationCode: 'NRT',
    hotelName: 'Park Hyatt Tokyo',
    location: 'Shinjuku, Tokyo',
    image: '/images/home/hotels/park-hyatt-tokyo.webp',
    priceFrom: 520,
    currency: 'USD',
    rating: 4.9,
    city: 'Tokyo',
  },
  {
    id: 'st-regis-maldives',
    title: 'The St. Regis Maldives',
    destinationName: 'Malé',
    destinationCode: 'MLE',
    hotelName: 'The St. Regis Maldives Vommuli Resort',
    location: 'Dhaalu Atoll, Maldives',
    image: '/images/home/hotels/st-regis-maldives.webp',
    discountLabel: '20% OFF',
    priceFrom: 890,
    currency: 'USD',
    rating: 4.9,
    city: 'Maldives',
  },
  {
    id: 'ayana-resort-bali',
    title: 'AYANA Resort Bali',
    destinationName: 'Denpasar',
    destinationCode: 'DPS',
    hotelName: 'AYANA Resort and Spa Bali',
    location: 'Jimbaran, Bali',
    image: '/images/home/hotels/ayana-resort-bali.webp',
    discountLabel: '12% OFF',
    priceFrom: 210,
    currency: 'USD',
    rating: 4.7,
    city: 'Bali',
  },
];

// ---------------------------------------------------------------------------
// Featured Flights
// ---------------------------------------------------------------------------
export interface FeaturedFlight {
  id: string;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  airline: string;
  tripType: 'round_trip' | 'one_way';
  cabinClass: string;
  priceFrom: number;
  currency: string;
  city: string;
}

export const featuredFlights: FeaturedFlight[] = [
  {
    id: 'dxb-lhr',
    origin: 'DXB',
    originCity: 'Dubai',
    destination: 'LHR',
    destinationCity: 'London',
    airline: 'Emirates',
    tripType: 'round_trip',
    cabinClass: 'Economy',
    priceFrom: 650,
    currency: 'USD',
    city: 'Dubai',
  },
  {
    id: 'jfk-cdx',
    origin: 'JFK',
    originCity: 'New York',
    destination: 'CDG',
    destinationCity: 'Paris',
    airline: 'Air France',
    tripType: 'round_trip',
    cabinClass: 'Economy',
    priceFrom: 580,
    currency: 'USD',
    city: 'New York',
  },
  {
    id: 'bcn-tyo',
    origin: 'BCN',
    originCity: 'Barcelona',
    destination: 'NRT',
    destinationCity: 'Tokyo',
    airline: 'Japan Airlines',
    tripType: 'round_trip',
    cabinClass: 'Economy',
    priceFrom: 820,
    currency: 'USD',
    city: 'Barcelona',
  },
  {
    id: 'lhr-dxb',
    origin: 'LHR',
    originCity: 'London',
    destination: 'DXB',
    destinationCity: 'Dubai',
    airline: 'Emirates',
    tripType: 'round_trip',
    cabinClass: 'Economy',
    priceFrom: 590,
    currency: 'USD',
    city: 'London',
  },
  {
    id: 'nrt-dps',
    origin: 'NRT',
    originCity: 'Tokyo',
    destination: 'DPS',
    destinationCity: 'Bali',
    airline: 'Garuda Indonesia',
    tripType: 'round_trip',
    cabinClass: 'Economy',
    priceFrom: 480,
    currency: 'USD',
    city: 'Tokyo',
  },
  {
    id: 'dxb-mle',
    origin: 'DXB',
    originCity: 'Dubai',
    destination: 'MLE',
    destinationCity: 'Malé',
    airline: 'Emirates',
    tripType: 'round_trip',
    cabinClass: 'Economy',
    priceFrom: 420,
    currency: 'USD',
    city: 'Dubai',
  },
];

// ---------------------------------------------------------------------------
// Featured Tours (Coming Soon — module not bookable yet)
// Images are local, vision-verified to match each tour's destination.
// ---------------------------------------------------------------------------
export interface FeaturedTour {
  id: string;
  title: string;
  location: string;
  image: string;
  duration: string;
  groupSize: string;
  priceFrom: number;
  currency: string;
  rating: number;
  city: string;
}

export const featuredTours: FeaturedTour[] = [
  {
    id: 'burj-al-arab-coast-cruise',
    title: 'Burj Al Arab & Dubai Coast Cruise',
    location: 'Jumeirah Beach, Dubai',
    image: '/images/home/tours/burj-al-arab-coast.webp',
    duration: '4 Hours',
    groupSize: 'Max 12',
    priceFrom: 95,
    currency: 'USD',
    rating: 4.8,
    city: 'Dubai',
  },
  {
    id: 'eiffel-tower-seine',
    title: 'Eiffel Tower Summit & Seine Cruise',
    location: 'Paris, France',
    image: '/images/home/tours/eiffel-tower-paris.webp',
    duration: 'Half Day',
    groupSize: 'Max 20',
    priceFrom: 89,
    currency: 'USD',
    rating: 4.9,
    city: 'Paris',
  },
  {
    id: 'santorini-caldera-oia',
    title: 'Santorini Caldera & Oia Sunset Walk',
    location: 'Santorini, Greece',
    image: '/images/home/tours/santorini-oia.webp',
    duration: 'Full Day',
    groupSize: 'Max 16',
    priceFrom: 110,
    currency: 'USD',
    rating: 4.9,
    city: 'Santorini',
  },
  {
    id: 'nusa-penida-island-hopping',
    title: 'Nusa Penida Island Hopping & Diamond Beach',
    location: 'Nusa Penida, Bali',
    image: '/images/home/tours/nusa-penida-islands.webp',
    duration: 'Full Day',
    groupSize: 'Max 10',
    priceFrom: 75,
    currency: 'USD',
    rating: 4.8,
    city: 'Bali',
  },
  {
    id: 'maldives-sandbank-snorkel',
    title: 'Maldives Sandbank Picnic & Reef Snorkel',
    location: 'North Malé Atoll, Maldives',
    image: '/images/home/tours/maldives-sandbank.webp',
    duration: '5 Hours',
    groupSize: 'Max 14',
    priceFrom: 120,
    currency: 'USD',
    rating: 4.9,
    city: 'Maldives',
  },
  {
    id: 'phang-nga-speedboat-safari',
    title: 'Phang Nga Bay Speedboat Safari',
    location: 'Phang Nga Bay, Phuket',
    image: '/images/home/tours/phang-nga-bay.webp',
    duration: 'Full Day',
    groupSize: 'Max 18',
    priceFrom: 85,
    currency: 'USD',
    rating: 4.7,
    city: 'Phuket',
  },
  {
    id: 'kyoto-temple-gion-walk',
    title: 'Kyoto Temples & Gion District Walk',
    location: 'Kyoto, Japan',
    image: '/images/home/tours/kyoto-temples.webp',
    duration: '6 Hours',
    groupSize: 'Max 12',
    priceFrom: 92,
    currency: 'USD',
    rating: 4.9,
    city: 'Kyoto',
  },
  {
    id: 'venice-gondola-grand-canal',
    title: 'Venice Gondola Ride & Grand Canal Tour',
    location: 'Venice, Italy',
    image: '/images/home/tours/venice-gondola.webp',
    duration: '2 Hours',
    groupSize: 'Max 6',
    priceFrom: 78,
    currency: 'USD',
    rating: 4.8,
    city: 'Venice',
  },
];

// ---------------------------------------------------------------------------
// Helper: build hotel search URL from a FeaturedHotel
// ---------------------------------------------------------------------------
export function buildHotelSearchUrl(hotel: FeaturedHotel): string {
  const checkIn = getDate(14);
  const checkOut = getDate(17);
  const params = new URLSearchParams({
    destinationName: hotel.destinationName,
    selectedDestinationCode: hotel.destinationCode,
    hotelName: hotel.hotelName,
    checkIn,
    checkOut,
    nationality: 'AE',
    rooms: JSON.stringify([{ adults: '2', children: '0', childAges: '' }]),
  });
  return `/hotels/search?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Helper: build flight search URL from a FeaturedFlight
// ---------------------------------------------------------------------------
export function buildFlightSearchUrl(flight: FeaturedFlight): string {
  const departureDate = getDate(flight.tripType === 'round_trip' ? 14 : 21);
  const returnDate = getDate(21);
  const params = new URLSearchParams({
    origin: flight.origin,
    destination: flight.destination,
    departureDate,
    tripType: flight.tripType,
    cabinClass: flight.cabinClass,
    adults: '1',
  });
  if (flight.tripType === 'round_trip') {
    params.set('returnDate', returnDate);
  }
  return `/flights/search?${params.toString()}`;
}
