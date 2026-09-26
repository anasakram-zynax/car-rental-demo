'use client';

// Branding hydration — the researched FOUC-prevention pattern:
// - server renders a STABLE SKELETON (no default branding at all)
// - provider resolves real values (server → localStorage cache → fetch) and
//   exposes `ready`; components swap skeleton → real branding only when ready.
// - localStorage cache makes repeats resolve instantly; favicon + title are
//   patched even earlier by a tiny <head> script (browser chrome only).

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSiteConfig } from '@/features/site/api/site-branding';

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

const CACHE_KEY = 'tq:branding';
// Cookie mirror of the branding bundle. localStorage is invisible to the
// server; the cookie rides every request so SSR can bake REAL branding into
// the HTML even when the backend is cold/unreachable (no default flash on
// repeat visits). Written on every resolve, 180d, sameSite=Lax (sent on
// same-site navigations, not cross-site). ~1-2KB max, well under the 4KB cap.
const BRANDING_COOKIE = 'tq_branding';
const BRANDING_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

function readCached(): SiteBrandingBundle {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return EMPTY;
    const b = JSON.parse(raw) as Partial<SiteBrandingBundle>;
    return {
      logo: b?.logo ?? null,
      favicon: b?.favicon ?? null,
      hero: { flights: b?.hero?.flights ?? null, hotels: b?.hero?.hotels ?? null },
      siteTitle: b?.siteTitle ?? null,
      siteDescription: b?.siteDescription ?? null,
    };
  } catch {
    return EMPTY;
  }
}

function pickBest(server: SiteBrandingBundle): SiteBrandingBundle {
  const cache = readCached();
  return {
    logo: server.logo ?? cache.logo ?? null,
    favicon: server.favicon ?? cache.favicon ?? null,
    hero: {
      flights: server.hero.flights ?? cache.hero.flights ?? null,
      hotels: server.hero.hotels ?? cache.hero.hotels ?? null,
    },
    siteTitle: server.siteTitle ?? cache.siteTitle ?? null,
    siteDescription: server.siteDescription ?? cache.siteDescription ?? null,
  };
}

function hasAny(b: SiteBrandingBundle): boolean {
  return Boolean(b.logo || b.favicon || b.hero.flights || b.hero.hotels || b.siteTitle || b.siteDescription);
}

function writeBrandingCookie(bundle: SiteBrandingBundle): void {
  if (typeof document === 'undefined') return;
  try {
    // Compact payload: only the fields the server renders.
    const compact = {
      l: bundle.logo,
      f: bundle.favicon,
      hf: bundle.hero.flights,
      hh: bundle.hero.hotels,
      t: bundle.siteTitle,
      d: bundle.siteDescription,
    };
    const value = encodeURIComponent(JSON.stringify(compact));
    if (value.length > 3000) return; // safety: stay well under the 4KB cookie cap
    document.cookie = `${BRANDING_COOKIE}=${value}; path=/; max-age=${BRANDING_COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    /* cookie unavailable (privacy mode etc.) — localStorage cache still works */
  }
}

const SiteBrandingContext = createContext<{ bundle: SiteBrandingBundle; ready: boolean; logoReady: boolean }>({
  bundle: EMPTY,
  ready: false,
  logoReady: false,
});

export function BrandingProvider({
  initial,
  children,
}: {
  initial: SiteBrandingBundle;
  children: ReactNode;
}) {
  // Hydration-safe: the FIRST client render must match the server exactly,
  // so the initial state here uses ONLY the server-provided `initial` —
  // never localStorage (a browser-only API the server can't see). Reading
  // it eagerly in a useState initializer (the old `pickBest(initial)` here)
  // ran during React's hydration pass too, where localStorage already holds
  // a cached bundle from a previous visit — the server rendered the "no
  // logo yet" skeleton/fallback while the client's very first render already
  // had a logo URL, a guaranteed hydration mismatch. The cache is instead
  // applied in the effect below, once mounted, where a state update is just
  // a normal re-render rather than a hydration diff.
  const [bundle, setBundle] = useState<SiteBrandingBundle>(initial);
  // Ready immediately if the server already gave us a usable value;
  // otherwise becomes ready once the cache/refresh effect resolves.
  const [ready, setReady] = useState<boolean>(hasAny(initial));
  // `ready` is a composite of every field (logo/favicon/hero/title) — it goes
  // true as soon as ANY of them resolves. That's fine for most consumers,
  // but it let Logo.tsx flash the wrong thing: if the SSR fetch came back
  // with e.g. a siteTitle but no logo (a transient backend hiccup on that
  // one field is enough — the branding API sits behind the same Supabase
  // pooler flakiness documented elsewhere in this app), `ready` went true
  // immediately with `bundle.logo` still null, and Logo.tsx read that as
  // "confirmed: no custom logo" and rendered the built-in default — then the
  // client-side refresh below landed a moment later with the real logo.
  // `logoReady` tracks the logo specifically: true the instant we HAVE one
  // (don't wait needlessly), otherwise only once the client fetch has
  // actually completed (success or failure) — a real answer, not a guess
  // from whatever other field happened to resolve first.
  const [logoFetchAttempted, setLogoFetchAttempted] = useState(false);
  const logoReady = !!bundle.logo || logoFetchAttempted;

  // Client-only: fold in the localStorage cache post-mount (instant branding
  // on repeat visits) without affecting what was hydrated.
  useEffect(() => {
    const cached = pickBest(initial);
    if (hasAny(cached)) {
      setBundle(cached);
      setReady(true);
    }
    // Only ever needs to run once, against the server-provided `initial`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist so the NEXT load resolves instantly. localStorage hydrates the
  // client; the cookie mirrors it for the SERVER (see readBrandingCookie).
  useEffect(() => {
    if (!hasAny(bundle)) return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
    } catch {
      /* storage unavailable */
    }
    writeBrandingCookie(bundle);
  }, [bundle]);

  // Refresh on every mount (admin edits propagate) — a single combined call.
  useEffect(() => {
    let cancelled = false;
    getSiteConfig()
      .then((cfg) => {
        if (cancelled) return;
        setBundle((prev) => ({
          logo: cfg.logo ?? prev.logo,
          favicon: cfg.favicon ?? prev.favicon,
          hero: {
            flights: cfg.hero?.flights ?? prev.hero.flights ?? null,
            hotels: cfg.hero?.hotels ?? prev.hero.hotels ?? null,
          },
          siteTitle: cfg.siteTitle ?? prev.siteTitle,
          siteDescription: cfg.siteDescription ?? prev.siteDescription,
        }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setReady(true);
          setLogoFetchAttempted(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <SiteBrandingContext.Provider value={{ bundle, ready, logoReady }}>{children}</SiteBrandingContext.Provider>
  );
}

export function useSiteBranding(): { bundle: SiteBrandingBundle; ready: boolean; logoReady: boolean } {
  return useContext(SiteBrandingContext);
}