import { apiRequest } from '@/lib/api/client';

export interface AncillaryLookupInput {
  offerId: string;
  productId: string;
  productIds?: string[];
  productSelections?: Array<{
    offeringId: string;
    productIds: string[];
  }>;
  catalogUuid?: string;
  from?: string;
  to?: string;
  departureDate?: string;
  travelerCount?: number;
  seatProductIds?: string[];
  baggageProductIds?: string[];
}

export function fetchAncillaryPrice(input: AncillaryLookupInput) {
  return apiRequest<unknown>('/flights/ancillaries/price', {
    method: 'POST',
    body: input,
  });
}

export function fetchPreviewSeatMap(searchKey: string, offerId: string, travelerCount?: number, provider?: string) {
  return apiRequest<unknown>('/flights/ancillaries/preview/seat-map', {
    method: 'POST',
    body: { searchKey, offerId, travelerCount, provider },
  });
}

/* ─── Unified Ancillary Catalog v2 ─── */

/**
 * Supplier reference — provider-specific opaque data.
 * The frontend passes this back at booking time; it never inspects the raw shape.
 */
export interface SupplierRef {
  provider: string;
  raw?: Record<string, unknown>;
}

/** Money value */
export interface Money {
  amount: number;
  currency: string;
}

/** Canonical ancillary pricing — mirrors backend PricingBreakdown shape. */
export interface AncillaryPricing {
  supplierPrice: Money;
  displayPrice?: Money;
  chargePrice?: Money;
}

/** Seat element in the unified seat map */
export interface UnifiedSeatElement {
  type: 'seat';
  seatNumber: string;
  column: string;
  available: boolean;
  pricing: AncillaryPricing;
  features: string[];
  supplierRef?: SupplierRef;
}

/** A row in the seat map */
export interface UnifiedSeatRow {
  rowNumber: number;
  elements: UnifiedSeatElement[];
}

/** A cabin section (economy, business, etc.) */
export interface UnifiedSeatCabin {
  cabinClass: string;
  rows: UnifiedSeatRow[];
}

/** One segment's seat map */
export interface UnifiedSeatMap {
  segmentId: string;
  segmentIndex: number;
  cabinClass: string;
  cabins: UnifiedSeatCabin[];
}

/** Included baggage from the fare */
export interface IncludedBaggage {
  id: string;
  summaryLabel: string;
  carryOnLabel?: string;
  checkedLabel?: string;
  pieces?: Array<{
    type: 'carry_on' | 'checked';
    maxWeightKg?: number;
    maxDimensionsCm?: string;
  }>;
}

/** A paid baggage option */
export interface PaidBaggage {
  id: string;
  type: 'carry_on' | 'checked';
  label: string;
  description?: string;
  pricing: AncillaryPricing;
  maxQuantity?: number;
  passengerRefs?: string[];
  segmentRefs?: string[];
  supplierRef?: SupplierRef;
}

/** A meal option */
export interface UnifiedMealOption {
  id: string;
  mealName: string;
  mealCode: string;
  dietaryType?: string;
  description?: string;
  pricing: AncillaryPricing;
  selectionMode?: 'direct' | 'requestOnly';
  supplierRef?: SupplierRef;
}

/** An extra service (priority, lounge, wifi, etc.) */
export interface UnifiedExtraService {
  id: string;
  type: 'priority' | 'lounge' | 'wifi' | 'sports_equipment' | 'pet' | 'other';
  label: string;
  description?: string;
  pricing: AncillaryPricing;
  maxQuantity?: number;
  supplierRef?: SupplierRef;
}

/** Passenger for ancillary selection */
export interface AncillaryPassenger {
  index: number;
  name: string;
  passengerType?: string;
}

/** What the provider supports */
export interface AncillaryCapabilities {
  seatMap: boolean;
  paidBaggage: boolean;
  includedBaggage: boolean;
  meals: boolean;
  services: boolean;
}

/** Unavailable reasons from the provider */
export interface AncillaryUnavailable {
  seats?: string;
  paidBaggage?: string;
  meals?: string;
  services?: string;
}

/** The unified ancillary catalog response from /flights/ancillaries/catalog/v2 */
export interface UnifiedAncillaryCatalog {
  ok: boolean;
  provider: string;
  offerId: string;
  searchKey: string;
  expiresAt: string;
  seats: UnifiedSeatMap[];
  baggage: {
    included: IncludedBaggage[];
    paid: PaidBaggage[];
  };
  meals: UnifiedMealOption[];
  services: UnifiedExtraService[];
  passengers: AncillaryPassenger[];
  unavailable: AncillaryUnavailable;
  capabilities: AncillaryCapabilities;
}

/**
 * Fetch the unified ancillary catalog for an offer.
 * Uses the v2 endpoint that returns UnifiedAncillaryCatalog.
 * When snapshotId is provided, the backend uses it as the canonical source.
 */
export function fetchAncillaryCatalog(
  searchKey: string,
  offerId: string,
  travelerCount: number,
  provider?: string,
  includedBaggageLabel?: string,
  snapshotId?: string,
) {
  return apiRequest<UnifiedAncillaryCatalog>('/flights/ancillaries/catalog/v2', {
    method: 'POST',
    body: { searchKey, offerId, travelerCount, provider, includedBaggageLabel, snapshotId },
  });
}

/* ─── Unified Seat Map → Legacy ApiSeatData conversion ─── */

/**
 * Convert UnifiedSeatMap[] from the v2 catalog into the legacy ApiSeatData[] + SeatMapRowLayout[]
 * format expected by the SeatMapModal. This lets the modal render unified catalog data
 * without requiring a separate /preview/seat-map call.
 */
export function unifiedSeatsToApiData(
  seatMaps: UnifiedSeatMap[],
): { apiSeatData: ApiSeatData[]; layout: SeatMapRowLayout[] } {
  const apiSeatData: ApiSeatData[] = [];
  const layoutMap = new Map<number, Set<string>>();

  for (const map of seatMaps) {
    for (const cabin of map.cabins ?? []) {
      for (const row of cabin.rows ?? []) {
        for (const element of row.elements ?? []) {
          if (element.type !== 'seat' || !element.seatNumber) continue;

          const letter = element.column ?? element.seatNumber.replace(/^\d+/, '');
          if (!layoutMap.has(row.rowNumber)) layoutMap.set(row.rowNumber, new Set());
          layoutMap.get(row.rowNumber)!.add(letter);

          apiSeatData.push({
            row: row.rowNumber,
            letter,
            seatNumber: element.seatNumber,
            position: element.pricing.supplierPrice.amount === 0 && element.features.includes('Included')
              ? 'middle' // fallback; actual position derived from column
              : (letter === 'A' || letter === 'F') ? 'window'
                : (letter === 'C' || letter === 'D') ? 'aisle'
                : 'middle',
            priceAmount: element.pricing.supplierPrice.amount,
            currency: element.pricing.supplierPrice.currency,
            available: element.available,
            features: element.features,
            productId: element.supplierRef?.raw?.serviceId as string | undefined,
          });
        }
      }
    }
  }

  // Build layout from collected row/column data
  const layout: SeatMapRowLayout[] = Array.from(layoutMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([rowNumber, colSet]) => {
      const columns = Array.from(colSet).sort();
      // Group consecutive columns (e.g. [A,B] [C,D,E] [F])
      const groups: string[][] = [];
      let currentGroup: string[] = [columns[0]];
      for (let i = 1; i < columns.length; i++) {
        const prev = columns[i - 1].charCodeAt(0);
        const curr = columns[i].charCodeAt(0);
        if (curr - prev === 1) {
          currentGroup.push(columns[i]);
        } else {
          groups.push(currentGroup);
          currentGroup = [columns[i]];
        }
      }
      groups.push(currentGroup);
      return { rowNumber, columns, groups };
    });

  return { apiSeatData, layout };
}

/* ─── Legacy types (kept for backwards compatibility with checkout session) ─── */

export type AncillaryCatalogType =
  | 'seat'
  | 'baggage'
  | 'meal'
  | 'sports_equipment'
  | 'priority'
  | 'lounge'
  | 'wifi'
  | 'pet'
  | 'other';

export type AncillaryCatalogSource = 'seatavailability' | 'ancillaryshop' | 'specialservices';

export interface AncillaryCatalogMoney {
  amount: number;
  currency: string;
}

export interface AncillaryCatalogSupplierIdentifiers {
  catalogOfferingsIdentifier?: string;
  catalogOfferingIdentifier?: string;
  productIdentifier?: string;
  travelerIdentifierRef?: string;
  seatAssignment?: string;
  ssrCode?: string;
  offerIdentifierValue?: string;
  reservationIdentifierValue?: string;
}

export interface AncillaryCatalogOption {
  id: string;
  type: AncillaryCatalogType;
  source: AncillaryCatalogSource;
  label: string;
  description?: string;
  price: AncillaryCatalogMoney;
  includedInOfferPrice?: boolean;
  requiresSupplierConfirmation?: boolean;
  travelerIndex?: number;
  travelerRef?: string;
  segmentRef?: string;
  segmentLabel?: string;
  quantityMin?: number;
  quantityMax?: number;
  supplier: AncillaryCatalogSupplierIdentifiers;
}

export interface AncillaryCatalogUnavailableReasons {
  seats?: string;
  baggage?: string;
  services?: string;
  meals?: string;
}

export interface AncillaryCatalogResponse {
  ok: boolean;
  searchKey: string;
  offerId: string;
  contentSource: 'NDC' | 'GDS';
  expiresAt: string;
  seats: AncillaryCatalogOption[];
  baggage: AncillaryCatalogOption[];
  services: AncillaryCatalogOption[];
  meals: AncillaryCatalogOption[];
  unavailableReasons: AncillaryCatalogUnavailableReasons;
  includedBaggage?: {
    summaryLabel: string;
    carryOnLabel?: string;
    checkedLabel?: string;
  };
  availabilityMode?: 'pre_booking_quote' | 'checkout_quote' | 'post_booking_only';
}

/* ─── Checkout Session API ─── */

export interface CheckoutSessionTravelerInput {
  givenName: string;
  surname: string;
  gender: string;
  birthDate: string;
  passengerTypeCode: string;
  phoneCountryCode: string;
  phoneNumber: string;
  email: string;
}

export interface CheckoutSessionPriceBreakdown {
  baseFare: number;
  taxes: number;
  total: number;
  currency: string;
  perTraveler: Array<{
    travelerIndex: number;
    baseFare: number;
    taxes: number;
    total: number;
  }>;
}

export interface CheckoutSessionResponse {
  ok: boolean;
  sessionKey: string;
  searchKey: string;
  offerId: string;
  contentSource: 'NDC' | 'GDS';
  expiresAt: string;
  priceBreakdown: CheckoutSessionPriceBreakdown;
  ancillaryCatalog: {
    seats: AncillaryCatalogOption[];
    baggage: AncillaryCatalogOption[];
    services: AncillaryCatalogOption[];
    meals: AncillaryCatalogOption[];
    unavailableReasons: AncillaryCatalogUnavailableReasons;
  };
}

export interface CheckoutSessionInput {
  searchKey: string;
  offerId: string;
  catalogUuid: string;
  productId?: string;
  productIds?: string[];
  productSelections?: Array<{
    offeringId: string;
    productIds: string[];
  }>;
  from: string;
  to: string;
  departureDate: string;
  tripType?: 'one_way' | 'round_trip';
  returnDate?: string;
  travelers: CheckoutSessionTravelerInput[];
}

export function createCheckoutSession(input: CheckoutSessionInput) {
  return apiRequest<CheckoutSessionResponse>('/flights/bookings/checkout-session', {
    method: 'POST',
    body: input,
    auth: true,
  });
}

export function getCheckoutSession(sessionKey: string) {
  return apiRequest<CheckoutSessionResponse>(`/flights/bookings/checkout-session/${encodeURIComponent(sessionKey)}`, {
    method: 'GET',
    auth: true,
  });
}

/**
 * Extract ApiServiceOption[] from the catalog response.
 */
export function catalogServicesToApiOptions(catalogServices: AncillaryCatalogOption[]): ApiServiceOption[] {
  return catalogServices
    .filter((opt) => opt.type !== 'seat' && opt.type !== 'baggage' && opt.type !== 'meal')
    .map((opt) => ({
      productId: opt.supplier.productIdentifier ?? opt.id,
      label: opt.label,
      description: opt.description ?? '',
      serviceType: opt.type,
      priceAmount: opt.price.amount,
      currency: opt.price.currency,
      catalogOfferingIdentifier: opt.supplier.catalogOfferingIdentifier,
      catalogOfferingsIdentifier: opt.supplier.catalogOfferingsIdentifier,
    }));
}

/**
 * Extract ApiBaggageOption[] from the catalog response.
 */
export function catalogBaggageToApiOptions(catalogBags: AncillaryCatalogOption[]): ApiBaggageOption[] {
  return catalogBags
    .filter((opt) => opt.type === 'baggage')
    .map((opt) => ({
      productId: opt.supplier.productIdentifier ?? opt.id,
      label: opt.label,
      description: opt.description ?? '',
      weight: opt.supplier.productIdentifier?.includes('23') ? '23 kg' : '23 kg',
      maxSize: '158 cm (total)',
      priceAmount: opt.price.amount,
      currency: opt.price.currency,
      icon: 'suitcase' as const,
      catalogOfferingIdentifier: opt.supplier.catalogOfferingIdentifier,
      catalogOfferingsIdentifier: opt.supplier.catalogOfferingsIdentifier,
      travelerIdentifierRef: opt.supplier.travelerIdentifierRef,
    }));
}

/** Meal SSR codes (parallel to backend MEAL_SSR_CODES) */
export const MEAL_SSR_CODES: Array<{ code: string; name: string; dietaryType: string; description: string }> = [
  { code: 'VGML', name: 'Vegan Meal', dietaryType: 'Vegan', description: 'Plant-based vegan meal' },
  { code: 'AVML', name: 'Asian Vegetarian Meal', dietaryType: 'Vegetarian', description: 'Asian-style vegetarian meal' },
  { code: 'HNML', name: 'Hindu Meal', dietaryType: 'Vegetarian', description: 'Hindu dietary requirements' },
  { code: 'KSML', name: 'Kosher Meal', dietaryType: 'Kosher', description: 'Kosher prepared meal' },
  { code: 'MOML', name: 'Muslim Meal', dietaryType: 'Halal', description: 'Halal prepared meal' },
  { code: 'CHML', name: 'Child Meal', dietaryType: 'Child', description: 'Age-appropriate child meal' },
  { code: 'BBML', name: 'Baby Meal', dietaryType: 'Baby', description: 'Baby food and formula' },
];

/**
 * Build MealOption[] from catalog meals + hardcoded SSR code definitions.
 */
export function catalogMealsToMealOptions(catalogMeals: AncillaryCatalogOption[]) {
  return catalogMeals
    .filter((opt) => opt.type === 'meal')
    .map((opt) => {
      const ssrCode = opt.supplier.ssrCode ?? '';
      const definition = MEAL_SSR_CODES.find((m) => m.code === ssrCode);
      return {
        productId: opt.supplier.productIdentifier ?? opt.id,
        mealName: definition?.name ?? opt.label,
        mealCode: ssrCode,
        dietaryType: definition?.dietaryType ?? 'Regular',
        description: definition?.description ?? opt.description ?? '',
        price: opt.price.amount,
        currency: opt.price.currency,
      };
    });
}

/* ─── Types for API-driven ancillary data ─── */

export interface ApiSeatData {
  row: number;
  letter: string;
  seatNumber: string; // e.g. "10A"
  position: 'window' | 'middle' | 'aisle';
  priceAmount: number;
  currency: string;
  available: boolean;
  features: string[];
  productId?: string;
  catalogOfferingsIdentifier?: string;
  catalogOfferingIdentifierValue?: string;
}

export interface ApiServiceOption {
  productId: string;
  label: string;
  description: string;
  serviceType: string;
  priceAmount: number;
  currency: string;
  /** Supplier identifiers from the catalog — needed for Travelport add */
  catalogOfferingIdentifier?: string;
  catalogOfferingsIdentifier?: string;
}

export interface ApiBaggageOption {
  productId: string;
  label: string;
  description: string;
  weight: string;
  maxSize: string;
  priceAmount: number;
  currency: string;
  icon?: 'suitcase' | 'sports' | 'cabin';
  /** Supplier identifiers from the catalog — needed for Travelport add */
  catalogOfferingIdentifier?: string;
  catalogOfferingsIdentifier?: string;
  travelerIdentifierRef?: string;
}

/** A single row's seat columns as reported by the aircraft ReferenceList */
export interface SeatMapRowLayout {
  rowNumber: number;
  /** All columns present in this row, sorted alphabetically */
  columns: string[];
  /** Columns split into groups separated by aisles (gaps in consecutive letters) */
  groups: string[][];
}

export interface AncillaryApiResponse {
  ok: boolean;
  seats?: ApiSeatData[];
  /** Aircraft seat layout from the ReferenceList — rows with their columns & aisle groups */
  layout?: SeatMapRowLayout[];
  baggage?: ApiBaggageOption[];
  error?: string;
}

/**
 * Parse the Travelport `buildancillaryoffersfromcatalogofferings` response
 * and extract seat + baggage offerings with pricing.
 */
export function parseAncillaryResponse(raw: unknown): AncillaryApiResponse {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Invalid response format' };
  }

  const root = raw as Record<string, unknown>;

  // Check if the response has an error flag
  if (root.ok === false) {
    return {
      ok: false,
      error: typeof root.message === 'string' ? root.message : 'Ancillary pricing unavailable',
    };
  }

  try {
    const seats = extractSeatsFromResponse(root);
    const baggage = extractBaggageFromResponse(root);

    return {
      ok: true,
      seats: seats.length > 0 ? seats : undefined,
      baggage: baggage.length > 0 ? baggage : undefined,
    };
  } catch {
    return { ok: false, error: 'Failed to parse ancillary response' };
  }
}

/**
 * Parse the Travelport seat map response (from the seat availability endpoint)
 * and extract seat data with layout, availability, and pricing.
 * 
 * Endpoint: POST /search/seat/catalogofferingsancillaries/seatavailabilities
 * Response: CatalogOfferingsAncillaryListResponse -> CatalogOffering[] -> Product[] -> SeatingChart
 */
export function parseSeatMapResponse(raw: unknown): AncillaryApiResponse {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Invalid seat map response format' };
  }

  const root = raw as Record<string, unknown>;

  // Check soft-fail error
  if (root.ok === false) {
    return {
      ok: false,
      error: typeof root.message === 'string' ? root.message : 'Seat map unavailable',
    };
  }

  // Duffel / unified response: { ok: true, seats: [...], layout: [...] }
  if (root.ok === true && Array.isArray(root.seats)) {
    return {
      ok: true,
      seats: root.seats as ApiSeatData[],
      layout: Array.isArray(root.layout)
        ? (root.layout as SeatMapRowLayout[])
        : undefined,
    };
  }

  try {
    const seats = extractSeatsFromSeatMap(root);
    const layout = extractLayoutFromSeatMap(root);
    return {
      ok: true,
      seats: seats.length > 0 ? seats : undefined,
      layout: layout.length > 0 ? layout : undefined,
    };
  } catch {
    return { ok: false, error: 'Failed to parse seat map response' };
  }
}

/* ─── Seat characteristics constants ─── */

/** Travelport Characteristic codes and their human-readable meanings */
const SEAT_CHAR_MAP: Record<string, string> = {
  W: 'Window view',
  A: 'Aisle access',
  H: 'Extra legroom',
  X: 'Exit row',
  P: 'Power outlet',
  V: 'In-seat video',
};

function getPositionFromChars(chars: string[]): 'window' | 'middle' | 'aisle' {
  if (chars.includes('W')) return 'window';
  if (chars.includes('A')) return 'aisle';
  return 'middle';
}

function getFeaturesFromChars(chars: string[]): string[] {
  const features: string[] = [];
  for (const c of chars) {
    const label = SEAT_CHAR_MAP[c];
    if (label && !features.includes(label)) features.push(label);
  }
  return features;
}

function getPositionFromColumn(letter: string): 'window' | 'middle' | 'aisle' {
  if (letter === 'A' || letter === 'F') return 'window';
  if (letter === 'B' || letter === 'E') return 'middle';
  return 'aisle';
}

/**
 * Parse the ReferenceList from the seat map response to build a seat → [characteristic] lookup.
 * ReferenceList contains SeatingCharts with Row[].Space[].location + Characteristic[].
 */
function parseReferenceList(
  referenceList: unknown[],
): Map<string, string[]> {
  const seatChars = new Map<string, string[]>();

  for (const ref of referenceList) {
    const entry = ref as Record<string, unknown>;
    const id = readString(entry.id) ?? readString(entry['@id']);
    if (!id?.startsWith('seatingChart')) continue;

    const rows = toArray(entry.Row as Record<string, unknown>[]);
    for (const row of rows) {
      const rowLabel = readString(row.label) ?? '';
      if (!rowLabel) continue;

      const spaces = toArray(row.Space as Record<string, unknown>[]);
      for (const space of spaces) {
        const location = readString(space.location);
        if (!location) continue;

        const chars = toArray(space.Characteristic as string[]).map(c => String(c));
        const seatKey = `${rowLabel}${location}`;
        seatChars.set(seatKey, chars);
      }
    }
  }

  return seatChars;
}

function extractSeatsFromSeatMap(root: Record<string, unknown>): ApiSeatData[] {
  const seats: ApiSeatData[] = [];

  const listResponse = root.CatalogOfferingsAncillaryListResponse as Record<string, unknown> | undefined;
  if (!listResponse) return seats;

  // Response-level catalog offerings identifier — needed for seat-add during booking
  const responseCatalogOfferingsIdentifier = readNestedString(listResponse, ['Identifier', 'value']);

  // Pre-parse ReferenceList for per-seat characteristics
  const referenceList = toArray(listResponse.ReferenceList as unknown[]);
  const seatChars = parseReferenceList(referenceList);

  // Navigate: CatalogOfferingsID[] -> CatalogOffering[] -> ProductOptions[] -> Product[] -> SeatAvailability[]
  const catalogOfferingsIds = toArray(listResponse.CatalogOfferingsID as Record<string, unknown>[]);

  for (const travelerFlight of catalogOfferingsIds) {
    const catalogOfferings = toArray(travelerFlight.CatalogOffering as Record<string, unknown>[]);

    for (const offering of catalogOfferings) {
      // Extract brand name and pricing from the CatalogOffering level
      const brandName = readString(
        (offering.Brand as Record<string, unknown> | undefined)?.name,
      ) ?? 'Standard';
      const price = extractOfferingPrice(offering);
      const catalogOfferingIdentifierValue = readNestedString(offering, ['Identifier', 'value']);

      const productOptions = toArray(offering.ProductOptions as Record<string, unknown>[]);
      for (const productOption of productOptions) {
        const products = toArray(productOption.Product as Record<string, unknown>[]);

        for (const product of products) {
          const seatAvailabilities = toArray(product.SeatAvailability as Record<string, unknown>[]);

          for (const sa of seatAvailabilities) {
            const status = readString(sa.seatAvailabilityStatus) ?? 'Available';
            const available = status === 'Available';
            const seatValues = toArray(sa.value as string[]);

            for (const seatValue of seatValues) {
              const seatStr = String(seatValue);
              const match = seatStr.match(/^(\d+)([A-Z])$/);
              if (!match) continue;

              const row = parseInt(match[1], 10);
              const letter = match[2];

              // Determine position & features from ReferenceList char codes, fall back to column heuristic
              const chars = seatChars.get(seatStr) ?? [];
              const position = chars.length > 0
                ? getPositionFromChars(chars)
                : getPositionFromColumn(letter);
              const features = getFeaturesFromChars(chars);

              // Add brand info as feature if applicable
              if (brandName !== 'Standard' && !features.includes(brandName)) {
                features.unshift(brandName);
              }

              seats.push({
                row,
                letter,
                seatNumber: seatStr,
                position,
                priceAmount: price.amount,
                currency: price.currency,
                available,
                features,
                productId: readString(product.id) ?? undefined,
                catalogOfferingsIdentifier: responseCatalogOfferingsIdentifier,
                catalogOfferingIdentifierValue,
              });
            }
          }
        }
      }
    }
  }

  return seats;
}

function readNestedString(obj: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Extract the row-by-row seat layout from the ReferenceList in the seat map response.
 * Groups columns into aisle-separated blocks based on gaps in consecutive letters.
 */
function extractLayoutFromSeatMap(root: Record<string, unknown>): SeatMapRowLayout[] {
  const listResponse = root.CatalogOfferingsAncillaryListResponse as Record<string, unknown> | undefined;
  if (!listResponse) return [];

  const referenceList = toArray(listResponse.ReferenceList as unknown[]);
  const rowMap = new Map<number, Set<string>>();

  for (const ref of referenceList) {
    const entry = ref as Record<string, unknown>;
    const id = readString(entry.id) ?? readString(entry['@id']);
    if (!id?.startsWith('seatingChart')) continue;

    const rows = toArray(entry.Row as Record<string, unknown>[]);
    for (const row of rows) {
      const rowLabel = readString(row.label) ?? '';
      const rowNum = parseInt(rowLabel, 10);
      if (isNaN(rowNum)) continue;

      if (!rowMap.has(rowNum)) rowMap.set(rowNum, new Set());
      const colSet = rowMap.get(rowNum)!;

      const spaces = toArray(row.Space as Record<string, unknown>[]);
      for (const space of spaces) {
        const location = readString(space.location);
        if (location) colSet.add(location);
      }
    }
  }

  // Convert to sorted array and group columns by consecutive letters
  const sortedRows = Array.from(rowMap.entries()).sort(([a], [b]) => a - b);

  return sortedRows.map(([rowNumber, colSet]) => {
    const columns = Array.from(colSet).sort();
    const groups: string[][] = [];
    let currentGroup: string[] = [columns[0]];

    for (let i = 1; i < columns.length; i++) {
      const prev = columns[i - 1].charCodeAt(0);
      const curr = columns[i].charCodeAt(0);
      if (curr - prev === 1) {
        currentGroup.push(columns[i]);
      } else {
        groups.push(currentGroup);
        currentGroup = [columns[i]];
      }
    }
    groups.push(currentGroup);

    return { rowNumber, columns, groups };
  });
}

function extractOfferingPrice(
  offering: Record<string, unknown>,
): { amount: number; currency: string } {
  const price = offering.Price as Record<string, unknown> | undefined;
  if (!price) return { amount: 0, currency: 'USD' };

  const totalPrice = readNumber(price.TotalPrice) ?? readNumber(price.Base) ?? 0;
  const currencyCode = price.CurrencyCode as Record<string, unknown> | undefined;
  const currency = readString(currencyCode?.value) ?? 'USD';

  return { amount: totalPrice, currency };
}

function extractSeatsFromResponse(root: Record<string, unknown>): ApiSeatData[] {
  const seats: ApiSeatData[] = [];
  const ancillaryOfferings = findAncillaryOfferings(root);

  for (const offering of ancillaryOfferings) {
    const products = toArray((offering as Record<string, unknown>).Product);
    for (const product of products) {
      const p = product as Record<string, unknown>;
      const seat = extractSeatData(p);
      if (seat) seats.push(seat);
    }
  }

  return seats;
}

function extractBaggageFromResponse(root: Record<string, unknown>): ApiBaggageOption[] {
  const baggage: ApiBaggageOption[] = [];
  const ancillaryOfferings = findAncillaryOfferings(root);

  for (const offering of ancillaryOfferings) {
    const products = toArray((offering as Record<string, unknown>).Product);
    for (const product of products) {
      const p = product as Record<string, unknown>;
      const bag = extractBaggageData(p);
      if (bag) baggage.push(bag);
    }
  }

  return baggage;
}

function findAncillaryOfferings(root: Record<string, unknown>): unknown[] {
  // Travelport response structure:
  // root -> AncillaryOfferingsResponse -> AncillaryOffering[]
  const ancillaryResponse =
    (root.AncillaryOfferingsResponse as Record<string, unknown>) ??
    (root.OfferListResponse as Record<string, unknown>) ??
    {};
  return toArray(ancillaryResponse.AncillaryOffering as unknown[]) ?? [];
}

function extractSeatData(product: Record<string, unknown>): ApiSeatData | null {
  // Check if this is a seat product
  const productType = readString(product['@type']);
  const isSeat =
    productType?.includes('Seat') ||
    productType?.includes('SeatAssignment') ||
    readString(product.seatType) !== undefined;

  if (!isSeat && !product.seatNumber && !product.SeatIdentifier) return null;

  const seatId = readString(product.seatNumber) ?? readString((product.SeatIdentifier as Record<string, unknown>)?.value) ?? '';
  if (!seatId) return null;

  // Parse row + letter from seat identifier (e.g. "10A" -> row 10, letter A)
  const match = seatId.match(/^(\d+)([A-Z])$/);
  if (!match) return null;

  const row = parseInt(match[1], 10);
  const letter = match[2];
  const position = getSeatPosition(letter);

  // Extract pricing
  const price = extractPrice(product);
  const features = extractSeatFeatures(product);

  return {
    row,
    letter,
    seatNumber: seatId,
    position,
    priceAmount: price.amount,
    currency: price.currency,
    available: product.available !== false,
    features,
    productId: readString(product.id) ?? undefined,
  };
}

function extractBaggageData(product: Record<string, unknown>): ApiBaggageOption | null {
  const productType = readString(product['@type']);
  const isBaggage =
    productType?.includes('Baggage') ||
    readString(product.baggageType) !== undefined;

  const baggageType = readString(product.baggageType);
  if (!isBaggage && !baggageType) return null;

  const measurements = toArray(product.Measurement as Record<string, unknown>[]);
  const weightMeasurement = measurements.find(
    (m) => readString(m.measurementType) === 'Weight',
  );
  const weight = weightMeasurement
    ? `${readNumber(weightMeasurement.value)} ${readString(weightMeasurement.unit) ?? 'kg'}`
    : baggageType === 'CarryOn'
      ? '8 kg'
      : '23 kg';

  const price = extractPrice(product);
  if (price.amount === 0) return null;

  const label = buildBaggageLabel(baggageType ?? '', weight);

  return {
    productId: readString(product.id) ?? `bag-${Date.now()}`,
    label,
    description: baggageType === 'CarryOn' ? 'Additional cabin bag' : `Checked baggage ${weight}`,
    weight,
    maxSize: baggageType === 'CarryOn' ? '55×35×20 cm' : '158 cm (total)',
    priceAmount: price.amount,
    currency: price.currency,
    icon: baggageType === 'CarryOn' ? 'cabin' : 'suitcase',
  };
}

function extractPrice(product: Record<string, unknown>): { amount: number; currency: string } {
  // Try various price field locations in Travelport response
  const totalPrice =
    readNumber(product.totalPrice) ??
    readNumber(product.TotalPrice) ??
    readNumber(product.totalAmount) ??
    readNumber(product.TotalAmount) ??
    0;

  const currency =
    readString(product.currency) ??
    readString(product.Currency) ??
    readString(product.currencyCode) ??
    readString((product.CurrencyCode as Record<string, unknown>)?.value) ??
    'USD';

  return { amount: totalPrice, currency };
}

function extractSeatFeatures(product: Record<string, unknown>): string[] {
  const features: string[] = [];
  const position = readString(product.position) ?? readString(product.seatPosition) ?? readString(product.SeatPosition);
  if (position === 'Window' || position === 'window') features.push('Window view');
  if (position === 'Aisle' || position === 'aisle') features.push('Aisle access');
  if (readString(product.legroom) === 'Extra' || readString(product.Legroom) === 'Extra') features.push('Extra legroom');
  if (readString(product.seatType) === 'ExitRow' || readString(product.SeatType) === 'ExitRow') features.push('Exit row');
  if (readString(product.seatType) === 'Bulkhead') features.push('Bulkhead seat');
  return features;
}

function getSeatPosition(letter: string): 'window' | 'middle' | 'aisle' {
  if (letter === 'A' || letter === 'F') return 'window';
  if (letter === 'B' || letter === 'E') return 'middle';
  return 'aisle';
}

function buildBaggageLabel(baggageType: string, weight: string): string {
  if (baggageType === 'CarryOn') return 'Extra Cabin Baggage';
  if (baggageType === 'FirstCheckedBag' || baggageType === 'Checked') {
    if (weight.includes('20')) return 'Checked Baggage 20kg';
    if (weight.includes('25')) return 'Checked Baggage 25kg';
    if (weight.includes('30')) return 'Checked Baggage 30kg';
    if (weight.includes('35')) return 'Checked Baggage 35kg';
    return `Checked Baggage ${weight}`;
  }
  return baggageType;
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) return value;
  return value != null ? [value] : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}
