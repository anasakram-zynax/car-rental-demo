import type { TravelSuggestion } from '@/features/autocomplete/types';

const BRIDGE_PREFIX = 'travq_bridge_';
const TTL_MS = 30 * 60 * 1000;

interface BridgeEntry {
  data: Record<string, unknown>;
  ts: number;
}

function key(scope: string) {
  return `${BRIDGE_PREFIX}${scope}`;
}

export function storeSearchBridge(scope: string, data: Record<string, TravelSuggestion | null>) {
  if (typeof window === 'undefined') return;
  try {
    const entry: BridgeEntry = { data, ts: Date.now() };
    sessionStorage.setItem(key(scope), JSON.stringify(entry));
  } catch { /* quota exceeded — best effort */ }
}

export function retrieveSearchBridge<T extends Record<string, TravelSuggestion | null>>(scope: string, { clear = true } = {}): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key(scope));
    if (!raw) return null;
    const entry: BridgeEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > TTL_MS) {
      sessionStorage.removeItem(key(scope));
      return null;
    }
    if (clear) sessionStorage.removeItem(key(scope));
    return entry.data as T;
  } catch {
    return null;
  }
}

export function clearSearchBridge(scope: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(key(scope));
  } catch { /* ignore */ }
}
