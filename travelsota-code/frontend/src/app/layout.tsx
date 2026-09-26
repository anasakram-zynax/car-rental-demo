import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { cookies } from 'next/headers';
import './globals.css';
import { AppProviders } from './providers/app-providers';
import { GATracker } from '@/components/analytics/GATracker';
import { FaviconSync } from '@/components/common/FaviconSync';
import { BrandingProvider } from '@/components/common/BrandingProvider';
import { SiteTitleSync } from '@/components/common/SiteTitleSync';
import DemoSessionTracker from '@/features/demo-request/components/DemoSessionTracker';
import { getSiteBrandingBundle } from '@/lib/site-branding.server';
import { PublicModulesProvider } from '@/lib/PublicModulesContext';
import type { PublicModulesInfo } from '@/features/admin/api/admin-settings';
// Static default favicon (public/favicon.svg, served at /favicon.svg). Always
// present in metadata so the SSR <head> has a real icon link with NO redirect;
// generateMetadata() swaps in the admin-uploaded favicon's FINAL URL when one
// is set. (The old /icon file-convention route 302-redirected, so the browser
// tab flashed the default icon until the redirect resolved — and lost the race
// against other icon links entirely.)
const DEFAULT_FAVICON = '/favicon.svg';

// Fetch at request time so the first paint already carries the real module
// state (names, visibility, order) — no flash of defaults on load.
// Stale-while-revalidate: within the TTL the value comes from memory with
// ZERO network on the critical path; after the TTL the stale value is served
// immediately and a background refresh runs. An awaited uncached round-trip
// here was adding its full 1-2s latency to every SSR'd page.
let modulesCache: { ts: number; data: PublicModulesInfo | null } | null = null;
const MODULES_TTL_MS = 30_000;
let modulesRefreshing = false;
function fetchModulesFromApi(): Promise<PublicModulesInfo | null> {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  return fetch(`${base}/settings/modules`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const body = await res.json();
      const d = body?.data ?? body ?? null;
      return d?.flights && d?.hotels ? (d as PublicModulesInfo) : null;
    })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}
function scheduleModulesRefresh(): void {
  if (modulesRefreshing) return;
  modulesRefreshing = true;
  void fetchModulesFromApi()
    .then((d) => {
      // Only stamp successful fetches — a failure must not poison the cache.
      if (d) modulesCache = { ts: Date.now(), data: d };
    })
    .catch(() => {})
    .finally(() => {
      modulesRefreshing = false;
    });
}
async function fetchInitialModules(): Promise<PublicModulesInfo | null> {
  if (modulesCache && Date.now() - modulesCache.ts < MODULES_TTL_MS) return modulesCache.data;
  if (modulesCache) {
    scheduleModulesRefresh();
    return modulesCache.data;
  }
  const fresh = await fetchModulesFromApi();
  if (fresh) modulesCache = { ts: Date.now(), data: fresh };
  return fresh;
}

const RTL_LOCALES = new Set(['ar', 'ur', 'fa', 'he']);

const siteName = 'TravelsOTA';
const siteDescription =
  'Book flights and hotels worldwide with real-time pricing, instant confirmations, and 24/7 support. The modern travel platform for business and leisure.';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://travelsota.com';

// Origin used for <head> resource hints (preconnect/dns-prefetch). Server
// components can't import next.config, so derive it from the same env var.
const apiOriginForHints = (() => {
  const baked = process.env.NEXT_PUBLIC_API_BASE_URL || '';
  if (!baked || baked.includes('localhost')) return null;
  try {
    return new URL(baked).origin;
  } catch {
    return null;
  }
})();

const defaultMetadata: Metadata = {
  title: {
    default: `${siteName} — Book Flights & Hotels Worldwide`,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: [
    'flight booking',
    'hotel booking',
    'travel platform',
    'cheap flights',
    'hotel deals',
    'business travel',
    'online travel agency',
    'TravelsOTA',
  ],
  authors: [{ name: 'TravelsOTA' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName,
    title: `${siteName} — Book Flights & Hotels Worldwide`,
    description: siteDescription,
    url: siteUrl,
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: siteName,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteName} — Book Flights & Hotels Worldwide`,
    description: siteDescription,
    images: [`${siteUrl}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  manifest: '/site.webmanifest',
  other: {
    'application-name': siteName,
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-title': siteName,
    'apple-mobile-web-app-capable': 'yes',
  },
};

/** Site title/description come from admin General settings — served at first
    paint (via the server branding bundle), not swapped after load. */
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getSiteBrandingBundle();
  const title = branding.siteTitle || siteName;
  const description = branding.siteDescription || siteDescription;

  return {
    ...defaultMetadata,
    title: {
      // Admin's site title is THE brand — used verbatim everywhere. The
      // template is %s so a page-level metadata title renders EXACTLY as the
      // page defines it, with no bundled " | TravelsOTA" suffix appended
      // (that was the fixed-brand prefix bug in the tab title).
      default: title,
      template: '%s',
    },
    description,
    // Serve the favicon's FINAL URL in the SSR <head> — admin upload when set,
    // else the static default. Browsers pick the LAST icon <link> when several
    // match; Next dedupes metadata icons, so this single entry wins everywhere.
    icons: {
      icon: [{ url: branding.favicon || DEFAULT_FAVICON }],
      shortcut: [{ url: branding.favicon || DEFAULT_FAVICON }],
      apple: [{ url: branding.favicon || DEFAULT_FAVICON }],
    },
    openGraph: {
      ...(defaultMetadata.openGraph ?? {}),
      siteName: title,
      title,
      description,
    },
  };
}



export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [locale, messages, initialModules, branding, cookieStore] = await Promise.all([
    getLocale(),
    getMessages(),
    fetchInitialModules(),
    getSiteBrandingBundle(),
    cookies(),
  ]);
  const dir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
  // Currency flash prevention (same pattern as tq_branding above): a
  // returning visitor's currency choice is baked into this SSR HTML via the
  // tq_currency cookie, so CurrencyProvider's first client render already
  // matches instead of flashing the hardcoded USD default before
  // localStorage is read.
  const initialCurrencyCode = cookieStore.get('tq_currency')?.value || undefined;

  return (
    <html
      lang={locale}
      dir={dir}
      className="h-full antialiased"
    >
      <head>
        {/* Resource hints: warm up the API origin (SSR + client fetches) and
            Cloudinary (hosts the LCP hero image for admin-branded sites). */}
        {apiOriginForHints && (
          <>
            <link rel="preconnect" href={apiOriginForHints} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={apiOriginForHints} />
          </>
        )}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://images.pexels.com" crossOrigin="anonymous" />
        {/* Google Analytics — deferred until the page is interactive. The
            blocking <script async> in <head> cost ~520ms of main-thread time
            during load; analytics does not need to compete with hydration.
            GATracker already guards on window.gtag before every call. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
(function(){function load(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=G-ZC4NKKHQXH';document.head.appendChild(s);gtag('js',new Date());gtag('config','G-ZC4NKKHQXH');}
if('requestIdleCallback' in window){requestIdleCallback(load,{timeout:4000});}else{setTimeout(load,2500);}})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'TravelAgency',
              name: siteName,
              url: siteUrl,
              description: siteDescription,
              foundingDate: '2024',
              areaServed: 'Worldwide',
              sameAs: [],
            }),
          }}
        />
        {/* Branding flash prevention (Option 3): the branding bundle is baked
            into this SSR HTML via getSiteBrandingBundle() — warm cache, backend
            fetch, or the visitor's own tq_branding cookie when the backend is
            unreachable. Metadata icons + tab title therefore carry REAL branding
            at first paint; logo/hero render skeletons until ready. The old
            localStorage pre-paint script was removed — the cookie+SSR path
            supersedes it and the two fought over the same <link> nodes. */}
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <PublicModulesProvider initial={initialModules}>
          <BrandingProvider initial={branding}>
<AppProviders initialCurrencyCode={initialCurrencyCode}>
              {children}
              <GATracker />
              <DemoSessionTracker />
              <FaviconSync seedHref={DEFAULT_FAVICON} />
              <SiteTitleSync />
            </AppProviders>
          </BrandingProvider>
          </PublicModulesProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
