import { useRef } from 'react';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useMutation, useQuery, type UseQueryOptions, type QueryKey } from '@tanstack/react-query';
import { repriceFlightSnapshot } from '../api/reprice-snapshot';
import type { SnapshotRepriceInput, SnapshotRepriceResponse } from '../api/reprice-snapshot';
import { repriceBooking } from '../api/reprice-booking';
import type { RepriceInput, RepriceResponse } from '../api/reprice-booking';
import { ROUTES } from '@/lib/routes';
import { apiRequest, type ApiError } from '@/lib/api/client';
import type { FlightSearchView } from '@/lib/schema/flight';
import type { FlightSearchInput } from '../api/search-flights';
import type { BookingPreviewInput, BookingPreviewResponse } from '../api/preview-booking';
import type { BookingConfirmInput, BookingConfirmResponse } from '../api/confirm-booking';
import type { FlightCheckoutInput, FlightCheckoutResponse } from '../api/checkout-booking';
import type { BookingDetailResponse } from '../api/get-booking';
import type { AncillaryLookupInput, UnifiedAncillaryCatalog } from '../api/ancillaries';
import type { CreateSnapshotInput } from '../api/create-snapshot';
import type { SnapshotDetailResponse } from '../api/get-snapshot-detail';

export function useFlightSearch() {
  return useApiMutation<FlightSearchView, FlightSearchInput>(ROUTES.FLIGHTS.SEARCH);
}

export function useFlightPreview() {
  return useApiMutation<BookingPreviewResponse, BookingPreviewInput>(
    ROUTES.FLIGHTS.PREVIEW, undefined, 'POST', { auth: true },
  );
}

export function useFlightConfirm() {
  return useApiMutation<BookingConfirmResponse, BookingConfirmInput>(
    ROUTES.FLIGHTS.CONFIRM, undefined, 'POST', { auth: true },
  );
}

export function useFlightBooking(bookingId: string, options?: Omit<UseQueryOptions<BookingDetailResponse, ApiError, BookingDetailResponse, QueryKey>, 'queryKey' | 'queryFn'>) {
  return useApiQuery<BookingDetailResponse>(
    ['flight-booking', bookingId],
    ROUTES.FLIGHTS.BOOKING(bookingId),
    { ...options, requestOptions: { auth: true } },
  );
}

export function useFlightAncillaryPrice() {
  return useApiMutation<unknown, AncillaryLookupInput>(ROUTES.FLIGHTS.ANCILLARY_PRICE);
}

export function useFlightCheckout() {
  return useApiMutation<FlightCheckoutResponse, FlightCheckoutInput>(
    ROUTES.FLIGHTS.CHECKOUT, undefined, 'POST', { auth: true },
  );
}

export function useFlightSnapshotDetail(snapshotId: string, options?: Omit<UseQueryOptions<SnapshotDetailResponse, ApiError, SnapshotDetailResponse, QueryKey>, 'queryKey' | 'queryFn'>) {
  return useApiQuery<SnapshotDetailResponse>(
    ['flight-snapshot', snapshotId],
    `/flights/offers/snapshots/${encodeURIComponent(snapshotId)}`,
    { ...options },
  );
}

export function useFlightSnapshotReprice() {
  return useMutation<SnapshotRepriceResponse, ApiError, SnapshotRepriceInput>({
    mutationFn: repriceFlightSnapshot,
  });
}

type AncillaryCatalogBody = {
  searchKey: string;
  offerId: string;
  travelerCount: number;
  travelers?: Array<{ index: number; type: string }>;
  provider?: string;
  includedBaggageLabel?: string;
  snapshotId?: string;
  displayCurrency?: string;
};

type FlightAncillaryCatalogOptions = Omit<UseQueryOptions<UnifiedAncillaryCatalog, ApiError, UnifiedAncillaryCatalog, QueryKey>, 'queryKey' | 'queryFn'>;
type SnapshotRepriceOptions = Omit<UseQueryOptions<SnapshotRepriceResponse, ApiError, SnapshotRepriceResponse, QueryKey>, 'queryKey' | 'queryFn'>;
type LegacyRepriceOptions = Omit<UseQueryOptions<RepriceResponse, ApiError, RepriceResponse, QueryKey>, 'queryKey' | 'queryFn'>;

export function useFlightAncillaryCatalog(body: AncillaryCatalogBody, options?: FlightAncillaryCatalogOptions) {
  const bodyRef = useRef(body);
  bodyRef.current = body;
  return useQuery<UnifiedAncillaryCatalog, ApiError>({
    queryKey: ['flight-ancillary-catalog', body.searchKey, body.offerId, body.snapshotId] as const,
    queryFn: ({ signal }) => apiRequest<UnifiedAncillaryCatalog>('/flights/ancillaries/catalog/v2', { method: 'POST', body: bodyRef.current, signal }),
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    ...options,
  });
}

export function useFlightSnapshotRepriceQuery(snapshotId: string, currency: string, body: Omit<SnapshotRepriceInput, 'snapshotId'>, options?: SnapshotRepriceOptions) {
  const bodyRef = useRef(body);
  bodyRef.current = body;
  return useQuery<SnapshotRepriceResponse, ApiError>({
    queryKey: ['flight-snapshot-reprice', snapshotId, currency] as const,
    queryFn: ({ signal }) => apiRequest<SnapshotRepriceResponse>(`/flights/offers/snapshots/${encodeURIComponent(snapshotId)}/reprice`, { method: 'POST', body: bodyRef.current, signal }),
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    ...options,
  });
}

export function useFlightLegacyRepriceQuery(body: RepriceInput, options?: LegacyRepriceOptions) {
  const bodyRef = useRef(body);
  bodyRef.current = body;
  return useQuery<RepriceResponse, ApiError>({
    queryKey: ['flight-legacy-reprice', body.offerId, body.searchKey, body.currency] as const,
    queryFn: ({ signal }) => repriceBooking({ ...bodyRef.current, signal } as RepriceInput & { signal: AbortSignal }),
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    ...options,
  });
}
