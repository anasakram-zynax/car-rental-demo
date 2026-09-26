import { apiRequest } from '@/lib/api/client';
import { getPublicEnv } from '@/lib/env/env';
import type { SearchProgressEvent, SearchJobStartResponse, SearchKind } from '../types/search-job';

/**
 * Start a background search job.
 * Returns the searchId and URLs for SSE events + final result.
 */
export async function startSearchJob(
  kind: SearchKind,
  body: Record<string, unknown>,
): Promise<SearchJobStartResponse> {
  return apiRequest<SearchJobStartResponse>(`/${kind}/search/jobs`, {
    method: 'POST',
    body,
    timeoutMs: 15_000,
  });
}

/**
 * Subscribe to SSE events for a search job.
 * Returns an EventSource and a cleanup function.
 * The caller should call cleanup() on unmount or when the job completes.
 *
 * Includes a silence watchdog: proxies/CDNs sometimes buffer SSE until the
 * stream ends, which looks identical to "no suppliers replied yet". If no
 * byte arrives (server sends heartbeats every 15s) within the watchdog
 * window, the connection is reopened (bounded retries) so the snapshot +
 * live stream get a fresh chance to flush.
 */
export function subscribeToSearchJobEvents(
  searchId: string,
  eventsUrl: string,
  onEvent: (event: SearchProgressEvent) => void,
  onError?: (error: Event) => void,
): { close: () => void } {
  const { NEXT_PUBLIC_API_BASE_URL } = getPublicEnv();
  const fullUrl = `${NEXT_PUBLIC_API_BASE_URL}${eventsUrl}`;

  let es: EventSource | null = null;
  let closed = false;
  let reconnects = 0;
  let lastReceivedAt = Date.now();
  let watchdog: ReturnType<typeof setInterval> | null = null;

  const SILENCE_LIMIT_MS = 45_000; // 3 missed heartbeats
  const MAX_RECONNECTS = 3;

  const clearWatchdog = () => {
    if (watchdog) {
      clearInterval(watchdog);
      watchdog = null;
    }
  };

  const connect = () => {
    const source = new EventSource(fullUrl);
    es = source;

    source.onmessage = (msg) => {
      lastReceivedAt = Date.now();
      try {
        const raw = JSON.parse(msg.data) as Record<string, unknown>;
        // NestJS @Sse wraps each emission as { data: event }.
        const event = (raw.data ?? raw) as SearchProgressEvent;
        if (event.type === 'heartbeat') return;
        onEvent(event);
      } catch {
        // Ignore malformed events
      }
    };

    source.onerror = (err) => {
      onError?.(err);
    };

    if (!watchdog) {
      watchdog = setInterval(() => {
        if (closed || !es || es.readyState === EventSource.CLOSED) return;
        if (Date.now() - lastReceivedAt > SILENCE_LIMIT_MS) {
          // Stream looks buffered or dead — force a fresh connection.
          es.close();
          es = null;
          if (reconnects < MAX_RECONNECTS) {
            reconnects += 1;
            lastReceivedAt = Date.now();
            connect();
          } else {
            onError?.(new Event('watchdog-silence'));
          }
        }
      }, 10_000);
    }
  };

  connect();

  return {
    close: () => {
      closed = true;
      clearWatchdog();
      if (es && es.readyState !== EventSource.CLOSED) {
        es.close();
      }
    },
  };
}

/**
 * Fetch the final search result after a job completes.
 */
export async function fetchSearchJobResult<T>(resultUrl: string): Promise<T> {
  return apiRequest<T>(resultUrl, { method: 'GET', timeoutMs: 15_000 });
}

/**
 * Cancel an active search job.
 * Called when the user selects an offer during progressive loading
 * to stop the remaining supplier searches.
 */
export async function cancelSearchJob(searchId: string): Promise<void> {
  const { NEXT_PUBLIC_API_BASE_URL } = getPublicEnv();
  await fetch(`${NEXT_PUBLIC_API_BASE_URL}/search-jobs/${encodeURIComponent(searchId)}`, {
    method: 'DELETE',
  }).catch(() => {});
}
