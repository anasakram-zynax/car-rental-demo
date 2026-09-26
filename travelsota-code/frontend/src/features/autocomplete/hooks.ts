import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest, type ApiError } from '@/lib/api/client';
import type { TravelSuggestion, AutocompleteModule } from './types';

interface UseTravelAutocompleteParams {
  module?: AutocompleteModule;
  debounceMs?: number;
  enabled?: boolean;
}

interface UseTravelAutocompleteReturn {
  query: string;
  setQuery: (q: string) => void;
  suggestions: TravelSuggestion[];
  popularSuggestions: TravelSuggestion[];
  isLoading: boolean;
  isPopularLoading: boolean;
  error: ApiError | null;
  clear: () => void;
}

export function useTravelAutocomplete(
  params: UseTravelAutocompleteParams = {},
): UseTravelAutocompleteReturn {
  const { module: mod, debounceMs = 150, enabled = true } = params;
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, debounceMs]);

  const { data, isLoading, error } = useQuery<TravelSuggestion[], ApiError>({
    queryKey: ['autocomplete', 'travel', debouncedQuery, mod],
    queryFn: ({ signal }) => {
      const searchParams = new URLSearchParams();
      searchParams.set('q', debouncedQuery);
      if (mod) searchParams.set('module', mod);
      return apiRequest<TravelSuggestion[]>(
        `/autocomplete/travel?${searchParams.toString()}`,
        { method: 'GET', signal },
      );
    },
    enabled: enabled && debouncedQuery.length >= 2,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const { data: popularData, isLoading: isPopularLoading } = useQuery<TravelSuggestion[], ApiError>({
    queryKey: ['autocomplete', 'popular', mod],
    queryFn: ({ signal }) => {
      const searchParams = new URLSearchParams();
      searchParams.set('q', '');
      if (mod) searchParams.set('module', mod);
      return apiRequest<TravelSuggestion[]>(
        `/autocomplete/travel?${searchParams.toString()}`,
        { method: 'GET', signal },
      );
    },
    enabled,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });

  const clear = useCallback(() => setQuery(''), []);

  return {
    query,
    setQuery,
    suggestions: data ?? [],
    popularSuggestions: popularData ?? [],
    isLoading,
    isPopularLoading,
    error: error ?? null,
    clear,
  };
}
