'use client';

import { useRef, useCallback, useEffect } from 'react';
import type { SearchProgressEvent } from '@/features/search-progress/types/search-job';

interface SSEConnectionOptions {
  url: string;
  onEvent: (event: SearchProgressEvent) => void;
  onError?: (error: Event) => void;
  onReconnect?: (attempt: number) => void;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

interface SSEConnection {
  close: () => void;
  reconnect: () => void;
}

/**
 * Enhanced SSE subscription with auto-reconnection support.
 * Uses Last-Event-ID for resuming after disconnect.
 */
export function useSSESubscription(): (options: SSEConnectionOptions) => SSEConnection {
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

  const connect = useCallback((options: SSEConnectionOptions): SSEConnection => {
    const {
      url,
      onEvent,
      onError,
      onReconnect,
      maxReconnectAttempts = 3,
      reconnectDelay = 2000,
    } = options;

    closedRef.current = false;
    reconnectAttemptRef.current = 0;

    const createConnection = (attempt: number) => {
      if (closedRef.current) return;

      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Build URL with Last-Event-ID for reconnection
      const connectionUrl = lastEventIdRef.current
        ? `${url}${url.includes('?') ? '&' : '?'}lastEventId=${encodeURIComponent(lastEventIdRef.current)}`
        : url;

      const es = new EventSource(connectionUrl);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          // Track Last-Event-ID for reconnection
          if (event.lastEventId) {
            lastEventIdRef.current = event.lastEventId;
          }

          const data = JSON.parse(event.data) as SearchProgressEvent;
          onEvent(data);

          // Reset reconnect attempts on successful event
          reconnectAttemptRef.current = 0;
        } catch (err) {
          console.error('[SSE] Failed to parse event:', err);
        }
      };

      es.onerror = (event) => {
        console.warn('[SSE] Connection error, attempt:', attempt);
        
        if (closedRef.current) return;

        if (attempt < maxReconnectAttempts) {
          reconnectAttemptRef.current = attempt + 1;
          onReconnect?.(attempt + 1);

          // Exponential backoff
          const delay = reconnectDelay * Math.pow(1.5, attempt);
          reconnectTimerRef.current = setTimeout(() => {
            createConnection(attempt + 1);
          }, delay);
        } else {
          onError?.(event);
        }
      };
    };

    createConnection(0);

    return {
      close: () => {
        closedRef.current = true;
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        lastEventIdRef.current = null;
      },
      reconnect: () => {
        if (!closedRef.current) {
          createConnection(reconnectAttemptRef.current);
        }
      },
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return connect;
}

/**
 * Groups search results by supplier/provider for display.
 */
export function groupResultsBySupplier<T extends { provider?: string }>(
  results: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  
  for (const item of results) {
    const provider = item.provider ?? 'unknown';
    const existing = groups.get(provider) ?? [];
    existing.push(item);
    groups.set(provider, existing);
  }
  
  return groups;
}

/**
 * Calculates supplier summary for progress display.
 */
export function getSupplierSummary<T extends { provider?: string }>(
  results: T[],
): Array<{ provider: string; count: number }> {
  const groups = groupResultsBySupplier(results);
  return Array.from(groups.entries())
    .map(([provider, items]) => ({ provider, count: items.length }))
    .sort((a, b) => b.count - a.count);
}
