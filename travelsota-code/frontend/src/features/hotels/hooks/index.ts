import { useApiMutation } from '@/hooks/useApiMutation';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { ROUTES } from '@/lib/routes';
import type { ApiError } from '@/lib/api/client';
import type { UseQueryOptions, QueryKey } from '@tanstack/react-query';
import type { HotelSearchView } from '@/lib/schema/hotel';
import type { HotelSearchInput } from '../api/search-hotels';
import type { CheckRateInput, CheckRateResponse } from '../api/check-rate';
import type { BookingInput } from '../api/book-hotel';
import type { HotelCheckoutInput, HotelCheckoutResponse } from '../api/hotel-checkout';
import type { HotelBookingDetailResponse } from '../api/get-booking';
import type { DestinationSuggestion } from '../api/suggest-destinations';
import type { HotelSuggestion } from '../api/suggest-hotels';
import { cancelBooking } from '../api/cancel-booking';
import type { CancelBookingInput, CancelBookingResponse } from '../api/cancel-booking';

export function useHotelSearch() {
  return useApiMutation<HotelSearchView, HotelSearchInput>(ROUTES.HOTELS.SEARCH);
}

export function useHotelCheckRate() {
  return useApiMutation<CheckRateResponse, CheckRateInput>(ROUTES.HOTELS.CHECK_RATE);
}

export function useHotelBook() {
  return useApiMutation<unknown, BookingInput>(ROUTES.HOTELS.BOOK, undefined, 'POST', { auth: true });
}

export function useHotelCheckout() {
  return useApiMutation<HotelCheckoutResponse, HotelCheckoutInput>(
    ROUTES.HOTELS.CHECKOUT, undefined, 'POST', { auth: true },
  );
}

export function useHotelCancel(options?: UseMutationOptions<CancelBookingResponse, ApiError, CancelBookingInput>) {
  return useMutation<CancelBookingResponse, ApiError, CancelBookingInput>({
    mutationFn: (input) => cancelBooking(input),
    ...options,
  });
}

export function useHotelBooking(bookingId: string, options?: Omit<UseQueryOptions<HotelBookingDetailResponse, ApiError, HotelBookingDetailResponse, QueryKey>, 'queryKey' | 'queryFn'>) {
  return useApiQuery<HotelBookingDetailResponse>(
    ['hotel-booking', bookingId],
    ROUTES.HOTELS.BOOKING(bookingId),
    { ...options, requestOptions: { auth: true } },
  );
}

export function useDestinationSuggestions(query: string) {
  const enabled = query.trim().length > 0;
  const path = enabled ? `${ROUTES.HOTELS.DESTINATIONS}?q=${encodeURIComponent(query.trim())}` : '';
  return useApiQuery<DestinationSuggestion[]>(
    ['hotel-destinations', query],
    path,
    { enabled },
  );
}

export function useHotelSuggestions(destinationCode: string, query: string) {
  const enabled = destinationCode.trim().length > 0;
  const params = new URLSearchParams({ destinationCode: destinationCode.trim() });
  if (query.trim()) params.set('q', query.trim());
  const path = enabled ? `${ROUTES.HOTELS.SUGGEST_HOTELS}?${params.toString()}` : '';
  return useApiQuery<HotelSuggestion[]>(
    ['hotel-suggestions', destinationCode, query],
    path,
    { enabled },
  );
}
