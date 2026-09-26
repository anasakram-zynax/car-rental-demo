import { apiRequest } from '@/lib/api/client';

// ── Unified Booking Item ──────────────────────────────────────
// Merges flight + hotel booking shapes into a single interface

export interface CustomerBookingItem {
  id: string;
  type: 'flight' | 'hotel';
  status: string;
  amount: number | null;
  currency: string | null;
  provider: string | null;
  reference: string | null;
  /** Flight-specific: locator code / PNR */
  locatorCode?: string | null;
  /** Hotel-specific: hotel name + snapshot */
  hotelName?: string | null;
  /** Flight route or hotel destination description */
  description?: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerBookingDetail {
  id: string;
  type: 'flight' | 'hotel';
  status: string;
  amount: number | null;
  currency: string | null;
  provider: string | null;
  reference: string | null;
  locatorCode?: string | null;
  hotelName?: string | null;
  description?: string | null;
  offerSnapshot?: Record<string, unknown> | null;
  travelerSnapshot?: Record<string, unknown>[] | null;
  holder?: Record<string, unknown> | null;
  paxes?: Record<string, unknown>[] | null;
  hotel?: Record<string, unknown> | null;
  receiptUrl?: string | null;
  holdExpiresAt?: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Bank-transfer receipt upload (image or PDF, max 5MB). Returns the CDN URL. */
async function uploadReceipt(
  scope: 'flights' | 'hotels',
  bookingId: string,
  file: File,
): Promise<string> {
  const { getAccessToken } = await import('@/lib/auth/storage');
  const { getPublicEnv } = await import('@/lib/env/env');
  const { NEXT_PUBLIC_API_BASE_URL } = getPublicEnv();
  const token = getAccessToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(
    `${NEXT_PUBLIC_API_BASE_URL}/${scope}/bookings/${bookingId}/receipt`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    },
  );
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
    data?: { receiptUrl?: string };
  } | null;
  if (!res.ok || !json?.success || !json.data?.receiptUrl) {
    throw new Error(json?.message ?? 'Receipt upload failed.');
  }
  return json.data.receiptUrl;
}

export async function uploadFlightReceipt(bookingId: string, file: File): Promise<string> {
  return uploadReceipt('flights', bookingId, file);
}

export async function uploadHotelReceipt(bookingId: string, file: File): Promise<string> {
  return uploadReceipt('hotels', bookingId, file);
}

// ── Cancel Booking Response ───────────────────────────────────

export interface CancelBookingResponse {
  bookingId: string;
  status: string;
  paymentStatus: string | null;
  cancellationFee?: number;
  refundAmount?: number;
  isFreeCancellation?: boolean;
  cancellationPolicyDescription?: string | null;
}

// ── API Functions ─────────────────────────────────────────────

/** Fetch all customer bookings (flight + hotel merged). */
export async function getCustomerBookings(): Promise<CustomerBookingItem[]> {
  const [flights, hotels] = await Promise.all([
    apiRequest<any[]>('/flights/bookings', { auth: true }),
    apiRequest<any[]>('/hotels/bookings', { auth: true }),
  ]);

  const unified: CustomerBookingItem[] = [];

  for (const f of flights ?? []) {
    unified.push({
      id: f.id,
      type: 'flight',
      status: f.status,
      amount: f.amount ?? null,
      currency: f.currency ?? null,
      provider: f.provider ?? null,
      reference: f.locatorCode ?? null,
      locatorCode: f.locatorCode ?? null,
      description: f.locatorCode ? `PNR: ${f.locatorCode}` : null,
      message: f.message ?? null,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    });
  }

  for (const h of hotels ?? []) {
    unified.push({
      id: h.id,
      type: 'hotel',
      status: h.status,
      amount: h.customerAmount ?? h.amount ?? null,
      currency: h.customerCurrency ?? h.currency ?? null,
      provider: 'hotelbeds',
      reference: h.reference ?? null,
      hotelName: h.hotel?.name?.description ?? h.hotel?.name ?? null,
      description: h.hotel?.name?.description ?? h.hotel?.name ?? null,
      message: h.message ?? null,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    });
  }

  // Sort by most recent first
  unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return unified;
}

/** Get a single flight booking detail. */
export async function getCustomerFlightBookingDetail(bookingId: string): Promise<CustomerBookingDetail> {
  const data = await apiRequest<any>(`/flights/bookings/${bookingId}`, { auth: true });
  return {
    id: data.id,
    type: 'flight',
    status: data.status,
    amount: data.amount ?? null,
    currency: data.currency ?? null,
    provider: data.provider ?? null,
    reference: data.locatorCode ?? null,
    locatorCode: data.locatorCode ?? null,
    offerSnapshot: data.offerSnapshot ?? null,
    travelerSnapshot: data.travelerSnapshot ?? null,
    message: data.message ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/** Get a single hotel booking detail. */
export async function getCustomerHotelBookingDetail(bookingId: string): Promise<CustomerBookingDetail> {
  const data = await apiRequest<any>(`/hotels/bookings/${bookingId}`, { auth: true });
  return {
    id: data.id,
    type: 'hotel',
    status: data.status,
    amount: data.customerAmount ?? data.amount ?? null,
    currency: data.customerCurrency ?? data.currency ?? null,
    provider: 'hotelbeds',
    reference: data.reference ?? null,
    hotelName: data.hotel?.name?.description ?? data.hotel?.name ?? null,
    holder: data.holder ?? null,
    paxes: data.paxes ?? null,
    hotel: data.hotel ?? null,
    message: data.message ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/** Cancel a booking (flight or hotel). */
export async function cancelCustomerBooking(bookingId: string, type: 'flight' | 'hotel', reason?: string): Promise<CancelBookingResponse> {
  if (type === 'flight') {
    return apiRequest<CancelBookingResponse>(`/flights/bookings/${bookingId}/cancel`, {
      method: 'POST',
      body: { reason },
      auth: true,
    });
  }
  return apiRequest<CancelBookingResponse>(`/hotels/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: { reason },
    auth: true,
  });
}

/** Statuses that are eligible for cancellation. */
export const CUSTOMER_CANCELLABLE_STATUSES = ['pending_payment', 'held_pending_payment', 'booking_in_progress', 'booked', 'confirmed'];
