export interface FlightFilters {
  priceRanges: string[];
  airlines: string[];
  stops: string | null;
  departureTimes: string[];
  arrivalTimes: string[];
  durations: string | null;
  cabinClasses: string[];
  refundable: boolean;
  freeCancellation: boolean;
  baggageIncluded: string | null;
  priceMin?: number;
  priceMax?: number;
  supplierFilters: string[];
  flightNumber?: string;
}

export function defaultFlightFilters(): FlightFilters {
  return {
    priceRanges: [],
    airlines: [],
    stops: null,
    departureTimes: [],
    arrivalTimes: [],
    durations: null,
    cabinClasses: [],
    refundable: false,
    freeCancellation: false,
    baggageIncluded: null,
    supplierFilters: [],
    flightNumber: undefined,
  };
}

export interface HotelFilters {
  priceRanges: string[];
  starRating: number[];
  guestRating: string | null;
  propertyTypes: string[];
  amenities: string[];
  mealOptions: string[];
  freeCancellation: boolean;
  distance: string | null;
  boardBasis: string[];
  priceMin?: number;
  priceMax?: number;
  supplierFilters: string[];
  hotelName?: string;
}

export function defaultHotelFilters(): HotelFilters {
  return {
    priceRanges: [],
    starRating: [],
    guestRating: null,
    propertyTypes: [],
    amenities: [],
    mealOptions: [],
    freeCancellation: false,
    distance: null,
    boardBasis: [],
    supplierFilters: [],
    hotelName: undefined,
  };
}

export interface FilterOption {
  label: string;
  count?: number;
  key?: string;
}

export interface FilterGroup {
  id: string;
  title: string;
  icon: string;
  type: 'checkbox' | 'radio' | 'rating' | 'toggle' | 'price_slider' | 'star_radio' | 'text_input';
  options: FilterOption[];
  priceRange?: { min: number; max: number };
  pricePresets?: Array<{ label: string; min: number; max: number }>;
  resultCount?: number;
  starCounts?: Record<number, number>;
  placeholder?: string;
}

export function countActiveFilters(filters: FlightFilters | HotelFilters): number {
  let count = 0;
  for (const value of Object.values(filters)) {
    if (Array.isArray(value)) {
      count += value.length;
    } else if (typeof value === 'boolean') {
      if (value) count += 1;
    } else if (value !== null && value !== '' && value !== undefined) {
      count += 1;
    }
  }
  return count;
}
