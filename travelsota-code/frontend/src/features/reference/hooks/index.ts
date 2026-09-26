import { useQuery } from '@tanstack/react-query';
import type { ApiError } from '@/lib/api/client';
import { getCountries } from '../api/countries';
import type { CountryOption } from '../api/countries';

/**
 * Fetch the full country list once and cache it indefinitely — the list is
 * static reference data and does not change between requests.
 */
export function useCountries() {
  return useQuery<CountryOption[], ApiError>({
    queryKey: ['reference-countries'] as const,
    queryFn: getCountries,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });
}
