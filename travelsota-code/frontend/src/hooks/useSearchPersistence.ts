'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FlightFilters, HotelFilters } from '@/lib/filters/types';

const SEARCH_HISTORY_KEY = 'travq_search_history';
const MAX_HISTORY_ITEMS = 5;

interface SearchHistoryItem {
  id: string;
  type: 'flights' | 'hotels';
  params: Record<string, string>;
  timestamp: number;
  label: string;
}

/**
 * Hook for persisting filters and sort in URL search params.
 * Makes searches shareable and bookmarkable.
 */
export function useFilterPersistence<T extends FlightFilters | HotelFilters>(
  filters: T,
  sort: string,
  onFiltersChange: (filters: T) => void,
  onSortChange: (sort: string) => void,
  defaultFilters: T,
  defaultSort: string,
) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitialized = useRef(false);

  // Read filters from URL on mount
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const urlFilters = searchParams.get('filters');
    const urlSort = searchParams.get('sort');

    if (urlFilters) {
      try {
        const parsed = JSON.parse(urlFilters) as Partial<T>;
        onFiltersChange({ ...defaultFilters, ...parsed });
      } catch {
        // Invalid JSON, use defaults
      }
    }

    if (urlSort && urlSort !== defaultSort) {
      onSortChange(urlSort);
    }
  }, [searchParams, defaultFilters, defaultSort, onFiltersChange, onSortChange]);

  // Write filters to URL when they change
  const updateUrl = useCallback(
    (newFilters: T, newSort: string) => {
      const params = new URLSearchParams(searchParams.toString());

      // Only save non-default values
      const hasNonDefaultFilters = JSON.stringify(newFilters) !== JSON.stringify(defaultFilters);
      if (hasNonDefaultFilters) {
        params.set('filters', JSON.stringify(newFilters));
      } else {
        params.delete('filters');
      }

      if (newSort !== defaultSort) {
        params.set('sort', newSort);
      } else {
        params.delete('sort');
      }

      const newUrl = `${window.location.pathname}?${params.toString()}`;
      router.replace(newUrl, { scroll: false });
    },
    [searchParams, defaultFilters, defaultSort, router],
  );

  return { updateUrl };
}

/**
 * Hook for managing search history in localStorage.
 */
export function useSearchHistory() {
  const getHistory = useCallback((): SearchHistoryItem[] => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  const addToHistory = useCallback(
    (item: Omit<SearchHistoryItem, 'id' | 'timestamp'>) => {
      const history = getHistory();
      const newItem: SearchHistoryItem = {
        ...item,
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
      };

      // Remove duplicates (same type + params)
      const filtered = history.filter(
        (h) => !(h.type === item.type && JSON.stringify(h.params) === JSON.stringify(item.params)),
      );

      // Add to front, keep max items
      const updated = [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS);

      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
      } catch {
        // Storage full or unavailable
      }
    },
    [getHistory],
  );

  const removeFromHistory = useCallback(
    (id: string) => {
      const history = getHistory();
      const updated = history.filter((h) => h.id !== id);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
      } catch {
        // Storage full or unavailable
      }
    },
    [getHistory],
  );

  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch {
      // Storage unavailable
    }
  }, []);

  return {
    history: getHistory(),
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}

/**
 * Hook for "Load More" pagination on search results.
 * Shows button only when remaining count >= minRemainToShow (default 100).
 */
export function useLoadMore<T>(
  items: T[],
  initialCount = 200,
  increment = 60,
  minRemainToShow = 100,
) {
  const [displayCount, setDisplayCount] = useState(initialCount);

  const displayedItems = items.slice(0, displayCount);
  const hasMore = displayCount < items.length;
  const totalRemaining = items.length - displayCount;
  // Only show button when enough items remain
  const showLoadMore = hasMore && totalRemaining >= minRemainToShow;
  const remainingCount = totalRemaining;

  const loadMore = useCallback(() => {
    setDisplayCount((prev) => Math.min(prev + increment, items.length));
  }, [increment, items.length]);

  const resetCount = useCallback(() => {
    setDisplayCount(initialCount);
  }, [initialCount]);

  // Reset when items change (new search)
  useEffect(() => {
    setDisplayCount(initialCount);
  }, [items, initialCount]);

  return {
    displayedItems,
    hasMore,
    remainingCount,
    showLoadMore,
    loadMore,
    resetCount,
  };
}

// Need to import useState for useLoadMore
import { useState } from 'react';
