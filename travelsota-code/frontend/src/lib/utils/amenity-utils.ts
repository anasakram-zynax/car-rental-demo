/**
 * Returns true if an amenity string is suitable for user-facing display.
 * Filters out numeric-only codes (Hotelbeds facility codes), empty strings,
 * and very short abbreviations.
 */
export function isDisplayAmenity(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length <= 1) return false;
  if (/^\d+$/.test(trimmed)) return false;
  return true;
}

/**
 * Common amenity label mappings for known codes.
 * Covers the most common codes from Hotelbeds facility codes and RateHawk.
 *
 * Hotelbeds facility codes (numeric):
 *   20 = Bar / Lounge
 *   50 = Restaurant
 *   70 = Gym / Fitness
 *   80 = Business Center
 *   90 = Laundry
 *   95 = Room Service
 *   100 = Parking
 *   105 = Valet Parking
 *   110 = Concierge
 *   120 = Elevator
 *   130 = Spa
 *   140 = Pool
 *   145 = Outdoor Pool
 *   150 = Indoor Pool
 *   160 = Jacuzzi
 *   170 = Sauna
 *   180 = Children's Pool
 *   190 = Air Conditioning
 *   200 = Heating
 *   210 = TV
 *   220 = Telephone
 *   230 = Internet
 *   240 = Wi-Fi
 *   250 = Babysitting
 *   260 = Pet Friendly
 *   270 = Wheelchair Accessible
 *   280 = Breakfast
 *   290 = Half Board
 *   300 = Full Board
 *   310 = All Inclusive
 */
export const AMENITY_LABELS: Record<string, string> = {
  wifi: "Wi-Fi",
  internet: "Internet",
  parking: "Parking",
  pool: "Pool",
  "swimming pool": "Swimming Pool",
  gym: "Gym",
  "fitness center": "Fitness Center",
  breakfast: "Breakfast",
  restaurant: "Restaurant",
  bar: "Bar",
  spa: "Spa",
  ac: "A/C",
  "air conditioning": "A/C",
  pet: "Pets OK",
  "pets allowed": "Pets OK",
  "airport shuttle": "Airport Shuttle",
  airport: "Airport Shuttle",
  laundry: "Laundry",
  "room service": "Room Service",
  "beach access": "Beach Access",
  beach: "Beach Access",
  accessible: "Accessible",
  elevator: "Elevator",
  "fitness centre": "Fitness Center",
  "free wifi": "Wi-Fi",
  "free parking": "Free Parking",
  // Hotelbeds facility codes (mapped from numeric codes)
  "10": "24-Hour Front Desk",
  "20": "Bar / Lounge",
  "30": "Business Facilities",
  "50": "Restaurant",
  "70": "Gym / Fitness",
  "80": "Business Center",
  "90": "Laundry",
  "95": "Room Service",
  "100": "Parking",
  "105": "Valet Parking",
  "110": "Concierge",
  "120": "Elevator",
  "130": "Spa",
  "140": "Pool",
  "145": "Outdoor Pool",
  "150": "Indoor Pool",
  "160": "Jacuzzi",
  "170": "Sauna",
  "180": "Children's Pool",
  "190": "Air Conditioning",
  "200": "Heating",
  "210": "TV",
  "220": "Telephone",
  "230": "Internet",
  "240": "Wi-Fi",
  "250": "Babysitting",
  "260": "Pet Friendly",
  "270": "Wheelchair Accessible",
  "280": "Breakfast",
  "290": "Half Board",
  "300": "Full Board",
  "310": "All Inclusive",
};

/**
 * Look up a user-friendly label for an amenity code or name.
 * Falls back to a pretty-printed version of the raw code (e.g.
 * BUFFET_BREAKFAST → "Buffet Breakfast") when no mapping exists.
 */
export function amenityLabel(code: string): string {
  if (!code) return '';
  const key = code.toLowerCase().replace(/[\s_-]+/g, "_");
  // Also try the raw lowercase
  const rawLower = code.toLowerCase().trim();
  const mapped = AMENITY_LABELS[key] ?? AMENITY_LABELS[rawLower];
  if (mapped) return mapped;

  // Pretty-print unknown supplier codes (Amadeus style: BUFFET_BREAKFAST)
  if (/^[A-Z0-9_]+$/.test(code) && code.includes('_')) {
    const pretty = code
      .split('_')
      .map((w) => (w ? w[0] + w.slice(1).toLowerCase() : ''))
      .join(' ')
      .trim();
    if (pretty) return pretty;
  }
  return code;
}

/**
 * Filter an array of amenity strings to only include display-safe ones.
 */
export function filterDisplayAmenities(amenities: string[]): string[] {
  return amenities.filter(isDisplayAmenity);
}
