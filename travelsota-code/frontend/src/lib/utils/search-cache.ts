'use client';

// Cross-page workflow memory: TTL cache of search results + deterministic
// back-target URLs + consume-once scroll anchors. sessionStorage only.

const PREFIX = 'tq-flow';
export const SEARCH_TTL_MS = 5 * 60 * 1000;

/** Stable cache key regardless of param order/casing. */
export function canonicalSearchKey(sp: URLSearchParams | string): string {
  const params = typeof sp === 'string' ? new URLSearchParams(sp) : new URLSearchParams(sp.toString());
  return Array.from(params.entries())
    .map(([k, v]) => [k.trim().toLowerCase(), v] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

function sk(name: string): string {
  return `${PREFIX}:${name}`;
}

// ── Result cache ──

interface CacheEnvelope<T> {
  ts: number;
  data: T;
}

export function saveSearchCache<T>(kind: 'flights' | 'hotels', key: string, data: T): void {
  try {
    const env: CacheEnvelope<T> = { ts: Date.now(), data };
    sessionStorage.setItem(sk(`results:${kind}:${key}`), JSON.stringify(env));
  } catch {
    // ponytail: quota exceeded or private mode — cache is an accelerator, silent skip
  }
}

export function loadSearchCache<T>(kind: 'flights' | 'hotels', key: string, ttlMs = SEARCH_TTL_MS): T | null {
  try {
    const raw = sessionStorage.getItem(sk(`results:${kind}:${key}`));
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope<T>;
    if (!env || Date.now() - env.ts > ttlMs) {
      sessionStorage.removeItem(sk(`results:${kind}:${key}`));
      return null;
    }
    return env.data;
  } catch {
    return null;
  }
}

// ── Last-visited URLs for deterministic back targets ──

export function saveLastUrl(name: 'flights-search' | 'hotels-search' | 'flight-details' | 'hotel-details', url: string): void {
  try {
    sessionStorage.setItem(sk(`url:${name}`), url);
  } catch {}
}

export function getLastUrl(name: 'flights-search' | 'hotels-search' | 'flight-details' | 'hotel-details'): string | null {
  try {
    return sessionStorage.getItem(sk(`url:${name}`));
  } catch {
    return null;
  }
}

// ── Consume-once scroll anchor ──

export function saveScrollAnchor(kind: 'flights' | 'hotels', offerId: string): void {
  try {
    sessionStorage.setItem(sk(`anchor:${kind}`), offerId);
  } catch {}
}

export function consumeScrollAnchor(kind: 'flights' | 'hotels'): string | null {
  try {
    const id = sessionStorage.getItem(sk(`anchor:${kind}`));
    if (id) sessionStorage.removeItem(sk(`anchor:${kind}`));
    return id;
  } catch {
    return null;
  }
}

// ── Form drafts (survive checkout → back navigation within the tab) ──

export function saveFormDraft<T>(name: string, data: T): void {
  try {
    sessionStorage.setItem(sk(`draft:${name}`), JSON.stringify(data));
  } catch {}
}

export function loadFormDraft<T>(name: string): T | null {
  try {
    const raw = sessionStorage.getItem(sk(`draft:${name}`));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearFormDraft(name: string): void {
  try {
    sessionStorage.removeItem(sk(`draft:${name}`));
  } catch {}
}
