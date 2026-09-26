import { apiRequest } from '@/lib/api/client';

export interface ExtrasCatalogItem {
  type: 'seat' | 'baggage' | 'meal' | 'service';
  ancillaryProductId: string;
  label: string;
  description?: string;
  catalogOfferingsIdentifier?: string;
  catalogOfferingIdentifier?: string;
  price: { amount: number; currency: string };
  seatNumber?: string;
  segmentRef?: string;
  travelerRef?: string;
  baggageType?: string;
  weight?: string;
  pieces?: number;
  mealCode?: string;
  dietaryType?: string;
}

export interface ExtrasCatalogResponse {
  items: ExtrasCatalogItem[];
  workbenchId?: string;
  sessionId?: string;
}

export interface ExtrasQuoteItem {
  ancillaryProductId: string;
  type: string;
  label: string;
  quotedPrice: { amount: number; currency: string };
  catalogOfferingsIdentifier?: string;
  catalogOfferingIdentifier?: string;
  supplierOfferIdentifier?: string;
}

export interface ExtrasQuoteResponse {
  items: ExtrasQuoteItem[];
  total: { amount: number; currency: string };
}

export interface ExtrasPaymentResponse {
  paymentId: string;
  status: string;
  providerPaymentId?: string;
  providerClientSecret?: string;
  providerCheckoutUrl?: string;
}

export interface ExtrasConfirmResponse {
  ok: boolean;
  status: string;
  committedItems: number;
  failedItems: number;
  failures: Array<{ ancillaryProductId: string; error: string }>;
  message?: string;
  locatorCode?: string;
}

export interface ExtrasStatusItem {
  id: string;
  type: string;
  status: string;
  label?: string;
  amount: number;
  currency: string;
  supplierErrorCode?: string;
  supplierErrorMessage?: string;
  createdAt: string;
}

export interface ExtrasStatusResponse {
  bookingId: string;
  extrasStatus: string;
  items: ExtrasStatusItem[];
}

export interface ConfirmSelection {
  ancillaryProductId: string;
  type: 'seat' | 'baggage' | 'meal' | 'service';
  label: string;
  travelerRef?: string;
  segmentRef?: string;
  seatNumber?: string;
  mealCode?: string;
  catalogOfferingsIdentifier?: string;
  catalogOfferingIdentifier?: string;
  price?: { amount: number; currency: string };
}

export async function getExtrasCatalog(bookingId: string): Promise<ExtrasCatalogResponse> {
  return apiRequest<ExtrasCatalogResponse>(`/flights/bookings/${bookingId}/extras/catalog`, {
    method: 'GET',
    auth: true,
  });
}

export async function quoteExtras(
  bookingId: string,
  seats: ExtrasCatalogItem[],
  baggage: ExtrasCatalogItem[],
  meals: ExtrasCatalogItem[],
  services: ExtrasCatalogItem[],
): Promise<ExtrasQuoteResponse> {
  return apiRequest<ExtrasQuoteResponse>('/flights/bookings/-/extras/quote', {
    method: 'POST',
    auth: true,
    body: {
      bookingId,
      seats: seats.map((s) => ({
        type: 'seat',
        travelerIndex: 0,
        travelerRef: s.travelerRef ?? '',
        segmentRef: s.segmentRef ?? '',
        seatNumber: s.seatNumber ?? '',
        ancillaryProductId: s.ancillaryProductId,
        price: s.price,
      })),
      baggage: baggage.map((b) => ({
        type: 'baggage',
        travelerIndex: 0,
        travelerRef: b.travelerRef ?? '',
        segmentRef: b.segmentRef ?? '',
        ancillaryProductId: b.ancillaryProductId,
        label: b.label,
        baggageType: b.baggageType ?? 'checked',
        weight: b.weight ?? '',
        pieces: b.pieces ?? 1,
        price: b.price,
        catalogOfferingsIdentifier: b.catalogOfferingsIdentifier,
        catalogOfferingIdentifier: b.catalogOfferingIdentifier,
      })),
      meals: meals.map((m) => ({
        type: 'meal',
        travelerIndex: 0,
        travelerRef: m.travelerRef ?? '',
        segmentRef: m.segmentRef ?? '',
        mealCode: m.mealCode ?? '',
        mealName: m.label,
        dietaryType: m.dietaryType ?? '',
        price: m.price,
      })),
      services: services.map((s) => ({
        type: s.type,
        travelerIndex: 0,
        travelerRef: s.travelerRef ?? '',
        segmentRef: s.segmentRef ?? '',
        ancillaryProductId: s.ancillaryProductId,
        label: s.label,
        serviceType: s.type,
        quantity: 1,
        price: s.price,
        catalogOfferingsIdentifier: s.catalogOfferingsIdentifier,
        catalogOfferingIdentifier: s.catalogOfferingIdentifier,
      })),
    },
  });
}

export async function payForExtras(
  bookingId: string,
  gateway: string,
): Promise<ExtrasPaymentResponse> {
  return apiRequest<ExtrasPaymentResponse>('/flights/bookings/-/extras/payment', {
    method: 'POST',
    auth: true,
    body: { bookingId, gateway },
  });
}

export async function confirmExtras(
  bookingId: string,
  items: ConfirmSelection[],
): Promise<ExtrasConfirmResponse> {
  return apiRequest<ExtrasConfirmResponse>('/flights/bookings/-/extras/confirm', {
    method: 'POST',
    auth: true,
    body: { bookingId, items },
  });
}

export async function getExtrasStatus(bookingId: string): Promise<ExtrasStatusResponse> {
  return apiRequest<ExtrasStatusResponse>(`/flights/bookings/${bookingId}/extras/status`, {
    method: 'GET',
    auth: true,
  });
}
