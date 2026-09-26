import { apiRequest } from '@/lib/api/client';

export interface SiteBranding {
  logo?: string | null;
  favicon?: string | null;
}

/** Public — site-wide brand assets (logo + favicon URLs). {} = use defaults. */
export function getSiteBranding() {
  return apiRequest<{ branding: SiteBranding }>('/settings/branding');
}

export interface SiteMeta {
  siteTitle: string | null;
  siteDescription: string | null;
}

/** Public — the entire site-wide branding in ONE call. */
export interface SiteConfig {
  logo: string | null;
  favicon: string | null;
  hero: { flights: string | null; hotels: string | null };
  siteTitle: string | null;
  siteDescription: string | null;
}

export function getSiteConfig() {
  return apiRequest<SiteConfig>('/settings/site-config');
}

/** Public — site title + description (browser tab, search engines). */
export function getSiteMeta() {
  return apiRequest<SiteMeta>('/settings/site-meta');
}

export interface HeroBackgrounds {
  flights?: string | null;
  hotels?: string | null;
}

/** Public — per-module homepage hero images. {} = use bundled defaults. */
export function getHeroBackgrounds() {
  return apiRequest<{ backgrounds: HeroBackgrounds }>('/settings/hero-backgrounds');
}