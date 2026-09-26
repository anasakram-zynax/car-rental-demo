export interface DecodedSeat {
  seat: string;
  flightLabel: string;
  brand: string;
  priceText: string;
  /** Supplier product identifier — used as ancillaryProductId in structured checkout instead of seat number */
  ancillaryProductId?: string;
  /** Response-level catalog offerings identifier from seat availability response */
  catalogOfferingsIdentifier?: string;
  /** CatalogOffering.Identifier.value from seat availability response */
  catalogOfferingIdentifierValue?: string;
  /** Passenger index for multi-passenger seat assignment */
  passengerIndex?: number;
  /** Segment index for multi-segment seat assignment */
  segmentIndex?: number;
  /** Provider's segment identifier for correlation */
  segmentId?: string;
}

export interface DecodedBaggage {
  productId: string;
  label: string;
  priceText?: string;
  /** Supplier identifiers from catalog — preserved for Travelport add workflow */
  catalogOfferingIdentifier?: string;
  catalogOfferingsIdentifier?: string;
  travelerIdentifierRef?: string;
  /** Traveler this baggage belongs to — used for multi-passenger bookings */
  travelerIndex?: number;
  /** Flight segment this baggage belongs to — used for round-trip bookings */
  segmentRef?: string;
}

export interface DecodedService {
  productId: string;
  label: string;
  serviceType: string;
  priceText?: string;
  /** Supplier identifiers preserved for Travelport add */
  catalogOfferingIdentifier?: string;
  catalogOfferingsIdentifier?: string;
  /** Traveler this service belongs to — used for multi-passenger bookings */
  travelerIndex?: number;
  /** Flight segment this service belongs to — used for round-trip bookings */
  segmentRef?: string;
}

export interface DecodedMeal {
  productId: string;
  mealName: string;
  mealCode: string;
  dietaryType: string;
  priceText?: string;
}

export interface ParsedPrice {
  amount: number;
  currency: string;
}

export function decodeSeat(value: string): DecodedSeat | undefined {
  if (!value.startsWith("seat:")) return undefined;
  try {
    return JSON.parse(decodeURIComponent(value.slice(5)));
  } catch {
    return undefined;
  }
}

export function decodeBaggage(value: string): DecodedBaggage | undefined {
  if (!value.startsWith("baggage:")) return undefined;
  try {
    return JSON.parse(decodeURIComponent(value.slice(8)));
  } catch {
    return undefined;
  }
}

export function decodeService(value: string): DecodedService | undefined {
  if (!value.startsWith("service:")) return undefined;
  try {
    return JSON.parse(decodeURIComponent(value.slice(8)));
  } catch {
    return undefined;
  }
}

export function decodeMeal(value: string): DecodedMeal | undefined {
  if (!value.startsWith("meal:")) return undefined;
  try {
    return JSON.parse(decodeURIComponent(value.slice(5)));
  } catch {
    return undefined;
  }
}

export function parsePriceText(priceText: string): ParsedPrice {
  const m = priceText.match(/^([\d.]+)\s*([A-Za-z]+)$/);
  if (!m) return { amount: 0, currency: "" };
  return { amount: parseFloat(m[1]), currency: m[2] };
}

export function sumAncillaryPrices(
  ids: string[],
  decoder: (v: string) => { priceText?: string } | undefined,
): number {
  return ids.reduce((sum, id) => {
    const decoded = decoder(id);
    if (!decoded?.priceText) return sum;
    return sum + parsePriceText(decoded.priceText).amount;
  }, 0);
}

export function encodeSeat(data: DecodedSeat): string {
  return `seat:${encodeURIComponent(JSON.stringify(data))}`;
}

export function encodeBaggage(data: DecodedBaggage): string {
  return `baggage:${encodeURIComponent(JSON.stringify(data))}`;
}

export function encodeService(data: DecodedService): string {
  return `service:${encodeURIComponent(JSON.stringify(data))}`;
}

export function encodeMeal(data: DecodedMeal): string {
  return `meal:${encodeURIComponent(JSON.stringify(data))}`;
}

export function formatCurrency(amount: number, currency: string): string {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })} ${currency}`;
}
