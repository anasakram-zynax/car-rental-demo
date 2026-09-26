import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/auth/storage';
import { getPublicEnv } from '@/lib/env/env';

const { NEXT_PUBLIC_API_BASE_URL } = getPublicEnv();

export const SESSION_EXPIRED_EVENT = 'travelsota:session-expired';

/** Tell every listener (AuthContext) that the session is dead — clears state + redirects. */
export function notifySessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
}

/** Combine a base URL with a path, preserving the base path. */
function combineUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : '/' + path;
  return normalizedBase + normalizedPath;
}

export interface ApiError {
  statusCode: number;
  message: string;
  code?: string;
  details?: unknown;
  requestId?: string | null;
  path?: string;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  auth?: boolean;
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const storedRefresh = getRefreshToken();
      const body: Record<string, string> = {};
      if (storedRefresh) body.refreshToken = storedRefresh;

      const res = await fetch(combineUrl(NEXT_PUBLIC_API_BASE_URL, '/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: storedRefresh ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });
      if (!res.ok) { clearTokens(); return false; }
      const payload = await res.json();
      const data = payload?.data ?? payload;
      if (data?.accessToken) {
        setTokens(data.accessToken, data.refreshToken ?? '');
      }
      return true;
    } catch { clearTokens(); return false; }
    finally { isRefreshing = false; }
  })();
  return refreshPromise;
}

/**
 * Proactively refresh the access token before critical operations (e.g. checkout).
 * Silently returns true on success, false on failure — never throws.
 */
export async function refreshAuthToken(): Promise<boolean> {
  return tryRefreshToken();
}

/**
 * Active demo session id, read straight from localStorage (avoids an
 * import cycle with the demo feature — this module is the lowest layer).
 */
function readDemoSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('demo_active_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionId?: string };
    return typeof parsed.sessionId === 'string' ? parsed.sessionId : null;
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 60000;
  const controller = new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  const url = combineUrl(NEXT_PUBLIC_API_BASE_URL, path);

  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Demo visitors stamp their session so the backend can capture which
  // endpoints the demo explores (Demo Intelligence -> activity feed).
  const demoSessionId = readDemoSessionId();
  if (demoSessionId) {
    headers['x-demo-session-id'] = demoSessionId;
  }

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      credentials: 'include',
    });

    if (response.status === 401 && options.auth) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        const newToken = getAccessToken();
        const retryHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (newToken) {
          retryHeaders['Authorization'] = `Bearer ${newToken}`;
        }
        const retryResponse = await fetch(url, {
          method: options.method ?? 'GET',
          headers: retryHeaders,
          body: options.body ? JSON.stringify(options.body) : undefined,
          credentials: 'include',
        });
        const retryContentType = retryResponse.headers.get('content-type') ?? '';
        const retryIsJson = retryContentType.includes('application/json');
        const retryPayload = retryIsJson ? await retryResponse.json() : null;
        if (!retryResponse.ok || retryPayload?.success === false) {
          if (retryResponse.status === 401) {
            clearTokens();
            notifySessionExpired();
          }
          const err: ApiError = {
            statusCode: retryPayload?.statusCode ?? retryResponse.status,
            message: retryPayload?.message ?? `HTTP ${retryResponse.status}`,
            code: retryPayload?.code,
            details: retryPayload?.details,
            requestId: retryPayload?.requestId ?? null,
            path: retryPayload?.path ?? path,
          };
          throw err;
        }
        return (retryPayload?.data ?? retryPayload) as T;
      }
      clearTokens();
      notifySessionExpired();
      const err: ApiError = {
        statusCode: 401,
        message: 'Session expired. Please sign in again.',
      };
      throw err;
    }

    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    let payload: Record<string, any> | null = null;
    if (isJson) {
      try {
        payload = await response.json();
      } catch (parseErr) {
        // Capture raw body prefix to diagnose proxy/truncation issues
        const rawText = await response.text().catch(() => '');
        const err: ApiError = {
          statusCode: response.status,
          message: `Invalid response from server (${(parseErr as Error).message}). Raw prefix: ${rawText.slice(0, 200)}`,
          code: 'INVALID_RESPONSE',
          path,
        };
        throw err;
      }
    }

    if (!response.ok || payload?.success === false) {
      const err: ApiError = {
        statusCode: payload?.statusCode ?? response.status,
        message: payload?.message ?? `HTTP ${response.status}`,
        code: payload?.code,
        details: payload?.details,
        requestId: payload?.requestId ?? null,
        path: payload?.path ?? path,
      };
      throw err;
    }

    return (payload?.data ?? payload) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (didTimeout) {
        throw { statusCode: 408, message: 'Request timeout. Please try again.' } as ApiError;
      }
      // Re-throw original AbortError so TanStack Query cancels cleanly without retry/error states
      throw error;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Like apiRequest but returns the raw body as a Blob — for file downloads
 * (CSV/PDF exports) where the standard { success, data } JSON envelope does
 * NOT apply. A non-2xx response throws ApiError (the body may still be a JSON
 * envelope describing the failure). On 401 it silently refreshes the token
 * once and retries, mirroring apiRequest's auth:true behavior.
 */
export async function apiRequestBlob(
  path: string,
  options: ApiRequestOptions = {},
): Promise<Blob> {
  const download = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(combineUrl(NEXT_PUBLIC_API_BASE_URL, path), {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      signal: options.signal,
    });
  };

  let response = await download();
  if (response.status === 401 && (options.auth ?? true)) {
    if (await tryRefreshToken()) {
      response = await download();
    }
  }

  if (!response.ok) {
    let payload: Record<string, any> | null = null;
    try {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) payload = await response.json();
    } catch {
      /* non-JSON error body — fall through to generic message */
    }
    const err: ApiError = {
      statusCode: payload?.statusCode ?? response.status,
      message: payload?.message ?? `HTTP ${response.status}`,
      code: payload?.code,
      details: payload?.details,
      requestId: payload?.requestId ?? null,
      path,
    };
    if (response.status === 401 && (options.auth ?? true)) {
      clearTokens();
      notifySessionExpired();
    }
    throw err;
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw { statusCode: response.status, message: 'The server returned an empty file.', path } as ApiError;
  }
  return blob;
}
