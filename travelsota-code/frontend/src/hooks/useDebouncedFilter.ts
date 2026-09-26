'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

/**
 * Debounced value hook - delays updating value until after delay ms
 * of no changes. Useful for filtering/search inputs.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounced callback hook - returns a debounced version of the callback
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay = 300,
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return useCallback(
    (...args: unknown[]) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  ) as T;
}

/**
 * Batched state update hook - collects multiple updates within a time window
 * and applies them all at once. Reduces re-renders from rapid SSE events.
 */
export function useBatchedState<T>(
  initialValue: T,
  batchWindowMs = 100,
): [T, (updater: (prev: T) => T) => void, () => T] {
  const [state, setState] = useState(initialValue);
  const pendingUpdates = useRef<Array<(prev: T) => T>>([]);
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleUpdate = useCallback(
    (updater: (prev: T) => T) => {
      pendingUpdates.current.push(updater);

      if (!batchTimer.current) {
        batchTimer.current = setTimeout(() => {
          const updates = pendingUpdates.current;
          pendingUpdates.current = [];
          batchTimer.current = null;

          if (updates.length > 0) {
            setState((prev) => {
              let result = prev;
              for (const update of updates) {
                result = update(result);
              }
              return result;
            });
          }
        }, batchWindowMs);
      }
    },
    [batchWindowMs],
  );

  const getLatest = useCallback(() => state, [state]);

  useEffect(() => {
    return () => {
      if (batchTimer.current) clearTimeout(batchTimer.current);
    };
  }, []);

  return [state, scheduleUpdate, getLatest];
}

/**
 * Memoized filter hook - only re-runs filter when inputs actually change
 */
export function useMemoizedFilter<T, F>(
  items: T[],
  filters: F,
  filterFn: (items: T[], filters: F) => T[],
  deps: unknown[] = [],
): T[] {
  const debouncedFilters = useDebouncedValue(filters, 150);

  return useMemo(() => {
    return filterFn(items, debouncedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, debouncedFilters, ...deps]);
}
