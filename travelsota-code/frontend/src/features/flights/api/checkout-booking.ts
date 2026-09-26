import { apiRequest } from '@/lib/api/client';
import type { TravelerInput } from './preview-booking';

export type PaymentGateway = 'STRIPE' | 'PAYPAL';

export interface AncillarySeatInput {
  type: 'seat';
  travelerIndex: number;
  travelerRef: string;
  segmentRef: string;
  seatNumber: string;
  ancillaryProductId: string;
  /** Response-level catalog offerings identifier from seat availability response */
  catalogOfferingsIdentifier?: string;
  /** CatalogOffering.Identifier.value from seat availability response */
  catalogOfferingIdentifierValue?: string;
  price: { amount: number; currency: string };
}

export interface AncillaryBaggageInput {
  type: 'baggage';
  travelerIndex: number;
  travelerRef: string;
  segmentRef: string;
  ancillaryProductId: string;
  /** Catalog offering-level identifier from the ancillary shop response — used for Travelport add */
  catalogOfferingIdentifier?: string;
  /** Catalog offerings-level identifier from the ancillary shop response */
  catalogOfferingsIdentifier?: string;
  label: string;
  baggageType: string;
  weight: string;
  pieces: number;
  price: { amount: number; currency: string };
}

export interface AncillaryMealInput {
  type: 'meal';
  travelerIndex: number;
  travelerRef: string;
  segmentRef: string;
  ancillaryProductId: string;
  mealCode: string;
  mealName: string;
  dietaryType: string;
  price: { amount: number; currency: string };
}

export interface AncillaryServiceInput {
  type: 'sports_equipment' | 'priority' | 'lounge' | 'wifi' | 'pet' | 'other';
  travelerIndex: number;
  travelerRef: string;
  segmentRef: string;
  ancillaryProductId: string;
  catalogOfferingIdentifier?: string;
  catalogOfferingsIdentifier?: string;
  label: string;
  serviceType: string;
  quantity: number;
  price: { amount: number; currency: string };
}

export interface AncillarySelectionsInput {
  seats: AncillarySeatInput[];
  baggage: AncillaryBaggageInput[];
  meals: AncillaryMealInput[];
  services: AncillaryServiceInput[];
}

export interface FlightCheckoutInput {
  offerId: string;
  productId?: string;
  productIds?: string[];
  productSelections?: Array<{
    offeringId: string;
    productIds: string[];
  }>;
  seatProductIds?: string[];
  baggageProductIds?: string[];
  /** Structured ancillary selections (Phase 4+) — replaces legacy seatProductIds/baggageProductIds */
  ancillaries?: AncillarySelectionsInput;
  catalogUuid?: string;
  offeringIdentifierValue?: string;
  tripType?: 'one_way' | 'round_trip' | 'multi_city';
  returnDate?: string;
  from: string;
  to: string;
  departureDate: string;
  searchKey?: string;
  /** Canonical snapshot ID — when provided, backend loads all supplier identifiers from snapshot */
  snapshotId?: string;
  totalPrice?: number;
  currency?: string;
  travelers: TravelerInput[];
  gateway: PaymentGateway;
  /** Unified pipeline Phase 8: agents default to wallet; 'gateway' forces the card flow. */
  paymentMethod?: 'wallet' | 'gateway';
  sessionKey?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface PriceBreakdown {
  baseFare: number;
  seatTotal: number;
  baggageTotal: number;
  mealTotal: number;
  serviceTotal: number;
  ancillaryTotal: number;
  totalAmount: number;
  currency: string;
  /** Pre-markup supplier base + applied markup — admin/agent visibility only */
  supplierBase?: number;
  markupAmount?: number;
  freshRepriceAvailable: boolean;
}

export interface FlightCheckoutResponse {
  bookingId: string;
  paymentId: string;
  amount: number;
  currency: string;
  clientSecret: string | null;
  checkoutUrl: string | null;
  priceBreakdown?: PriceBreakdown;
  /** Present when the server took the agent wallet branch (Phase 8). */
  paymentMethod?: 'wallet';
  displayAmount?: number;
  displayCurrency?: string;
  holdId?: string;
  message?: string;
}

export function checkoutBooking(input: FlightCheckoutInput) {
  return apiRequest<FlightCheckoutResponse>('/flights/bookings/checkout', {
    method: 'POST',
    body: input,
    auth: true,
    timeoutMs: 120000, // Travelport booking workflow can take 25-40s
  });
}
