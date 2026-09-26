// Server-side branding reader for SSR. Makes logo, favicon, and hero images
// available at FIRST PAINT — no default-flash on reload.
//
// Performance contract (TTFB): this function sits on the critical path of
// EVERY SSR'd page. An awaited network round-trip here adds its full latency
// (measured 1-2s in production) to the HTML response. Therefore:
//  - Within the TTL: served synchronously from memory (zero network).
//  - After the TTL: the STALE value is returned IMMEDIATELY while a background
//    refresh runs (stale-while-revalidate). The next request picks it up.
//  - First-ever call (cold process): one bounded attempt (~2s worst case).
//  - A failed fetch NEVER wipes a good cached value.
//
// Robustness rules (learned from production: a deployment where the origin
// cannot reach the baked API host returned EMPTY for EVERY request):
//  1. Try multiple API bases: per-request same-origin proxy first, then the
//     baked NEXT_PUBLIC_API_BASE_URL, then the canonical production host.
//  2. Bound every attempt to ~2s.

import { headers } from 'next/headers';

const TTL_MS = 60_000;
const BRANDING_COOKIE = 'tq_branding';
let cache: { ts: number; data: SiteBrandingBundle } | null = null;
let refreshing = false;

export interface SiteBrandingBundle {
  logo: string | null;
  favicon: string | null;
  hero: { flights: string | null; hotels: string | null };
  siteTitle: string | null;
  siteDescription: string | null;
}

const EMPTY: SiteBrandingBundle = {
  logo: null,
  favicon: null,
  hero: { flights: null, hotels: null },
  siteTitle: null,
  siteDescription: null,
};

function hasAny(b: SiteBrandingBundle): boolean {
  return Boolean(b.logo || b.favicon || b.hero.flights || b.hero.hotels || b.siteTitle || b.siteDescription);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveApiBases(origin: string): Promise<string[]> {
  const bases: string[] = [];
  // 1. Same-origin proxy (next.config rewrites /api/v1/* → backend). Works
  //    wherever the site itself is reachable — the most portable option.
  bases.push(`${origin}/api/v1`);
  // 2. The baked API base (when it points at a real remote host).
  const baked = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (baked && !baked.includes('localhost')) {
    bases.push(baked.replace(/\/+$/, ''));
  }
  // 3. Canonical production API host (covers cases where the origin proxy or
  //    DNS for the site domain is unreachable from the SSR process).
  bases.push('https://server.travelsota.com/api/v1');
  // De-duplicate, keep order.
  return [...new Set(bases)];
}

/**
 * Unwrap the backend's standard response envelope. Every NestJS endpoint
 * returns `{ success, statusCode, message, ..., data: {...} }` — the payload
 * lives under `data`. Reading fields off the envelope directly made every
 * lookup undefined, so SSR branding silently ALWAYS failed and the HTML was
 * baked with defaults (the site-title/favicon/hero flash).
 */
function unwrapEnvelope<T>(json: unknown): T | null {
  if (json === null || typeof json !== 'object') return null;
  const maybe = json as { data?: unknown };
  if ('data' in maybe && maybe.data !== null && typeof maybe.data === 'object') {
    return maybe.data as T;
  }
  // Tolerate a plain (non-enveloped) payload as well.
  return json as T;
}

async function fetchBundleFromApis(): Promise<SiteBrandingBundle | null> {
  let origin = '';
  try {
    const h = await headers();
    const host = h.get('host') ?? '';
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    origin = `${proto}://${host}`;
  } catch {
    // headers() unavailable — bases 2 and 3 still apply.
  }

  const bases = await resolveApiBases(origin);
  for (const base of bases) {
    const cfg = unwrapEnvelope<{
      logo?: string | null;
      favicon?: string | null;
      hero?: { flights?: string | null; hotels?: string | null };
      siteTitle?: string | null;
      siteDescription?: string | null;
    }>(await fetchJson<unknown>(`${base}/settings/site-config`));

    if (cfg && (cfg.logo || cfg.favicon || cfg.siteTitle || cfg.hero?.flights || cfg.hero?.hotels)) {
      return {
        logo: cfg.logo ?? null,
        favicon: cfg.favicon ?? null,
        hero: {
          flights: cfg.hero?.flights ?? null,
          hotels: cfg.hero?.hotels ?? null,
        },
        siteTitle: cfg.siteTitle ?? null,
        siteDescription: cfg.siteDescription ?? null,
      };
    }
  }
  return null;
}

/**
 * Kick off a background refresh without awaiting it. Cooldown prevents a
 * burst of requests from stampeding the backend.
 */
function scheduleRefresh(): void {
  if (refreshing) return;
  refreshing = true;
  void fetchBundleFromApis()
    .then((fresh) => {
      if (fresh) cache = { ts: Date.now(), data: fresh };
    })
    .catch(() => {})
    .finally(() => {
      refreshing = false;
    });
}

/**
 * Last-resort source: the visitor's own branding cookie (written by
 * BrandingProvider on every resolve). When the backend is unreachable/cold AND
 * nothing is cached server-side, the cookie still lets us bake the REAL
 * branding into this visitor's SSR HTML instead of defaults — no flash on
 * repeat visits even during a backend outage or right after a deploy.
 *
 * NOT stamped into the module cache: the cookie is per-visitor and could be
 * stale; the shared cache must only ever hold backend-confirmed values.
 */
async function readBrandingCookie(): Promise<SiteBrandingBundle | null> {
  try {
    const h = await headers();
    const raw = h.get('cookie') ?? '';
    const match = raw.match(new RegExp(`(?:^|;\\s*)${BRANDING_COOKIE}=([^;]*)`));
    if (!match) return null;
    const parsed = JSON.parse(decodeURIComponent(match[1])) as Record<string, unknown>;
    // Accept BOTH shapes: the compact cookie written by BrandingProvider
    // ({l, f, hf, hh, t, d}) and a full-name bundle ({logo, favicon, ...}).
    // The compact writer and this reader previously disagreed, so the cookie
    // fallback silently never produced values (default flash on repeat visits
    // whenever the backend was cold/unreachable).
    const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
    const heroObj = (parsed.hero ?? {}) as Record<string, unknown>;
    const bundle: SiteBrandingBundle = {
      logo: str(parsed.l) ?? str(parsed.logo),
      favicon: str(parsed.f) ?? str(parsed.favicon),
      hero: {
        flights: str(parsed.hf) ?? str(heroObj.flights),
        hotels: str(parsed.hh) ?? str(heroObj.hotels),
      },
      siteTitle: str(parsed.t) ?? str(parsed.siteTitle),
      siteDescription: str(parsed.d) ?? str(parsed.siteDescription),
    };
    return hasAny(bundle) ? bundle : null;
  } catch {
    return null;
  }
}

export async function getSiteBrandingBundle(): Promise<SiteBrandingBundle> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return EMPTY;
  }

  // Warm cache → zero network on the critical path.
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.data;

  // Stale value → return it now, refresh in the background.
  if (cache) {
    scheduleRefresh();
    return cache.data;
  }

  // Cold process: one bounded blocking attempt so the very first HTML after a
  // deploy still carries real branding.
  const fresh = await fetchBundleFromApis();
  if (fresh) {
    cache = { ts: Date.now(), data: fresh };
    return fresh;
  }

  // Backend unreachable with nothing cached: fall back to the visitor's own
  // branding cookie so THEIR HTML still carries the real branding (no default
  // flash). Never cached — the next request retries the backend first.
  const fromCookie = await readBrandingCookie();
  if (fromCookie) return fromCookie;

  return EMPTY;
}
