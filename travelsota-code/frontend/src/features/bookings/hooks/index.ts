import { useApiQuery } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api/client';
import type { UseQueryOptions, QueryKey } from '@tanstack/react-query';
import type { HotelBookingDetailResponse } from '@/features/hotels/api/get-booking';
import type { BookingDetailResponse } from '@/features/flights/api/get-booking';

export function useHotelBooking(
  bookingId: string,
  options?: Omit<
    UseQueryOptions<HotelBookingDetailResponse, ApiError, HotelBookingDetailResponse, QueryKey>,
    'queryKey' | 'queryFn'
  >,
) {
  return useApiQuery<HotelBookingDetailResponse>(
    ['hotel-booking', bookingId],
    `/hotels/bookings/${bookingId}`,
    { ...options },
  );
}

export function useFlightBooking(
  bookingId: string,
  options?: Omit<
    UseQueryOptions<BookingDetailResponse, ApiError, BookingDetailResponse, QueryKey>,
    'queryKey' | 'queryFn'
  >,
) {
  return useApiQuery<BookingDetailResponse>(
    ['flight-booking', bookingId],
    `/flights/bookings/${bookingId}`,
    { ...options },
  );
}

export function useBookingProgress(bookingId: string, isHotel: boolean) {
  const path = bookingId
    ? isHotel
      ? `/hotels/bookings/${bookingId}/progress`
      : `/flights/bookings/${bookingId}/progress`
    : '';
  return useApiQuery<{
    bookingId: string;
    module: 'hotels' | 'flights';
    provider: string;
    status: 'running' | 'success' | 'failed' | 'idle';
    percent: number;
    title: string;
    message?: string;
    steps: Array<{
      id: string;
      label: string;
      description?: string;
      status: string;
      provider?: string;
      startedAt?: string;
      completedAt?: string;
      durationMs?: number;
      message?: string;
    }>;
  }>(['booking-progress', bookingId, isHotel], path, {
    enabled: !!bookingId,
  });
}
