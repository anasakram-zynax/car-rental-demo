import { adminRequest } from '@/lib/api/admin-client';
import { apiRequest } from '@/lib/api/client';
import { getPublicEnv } from '@/lib/env/env';

export interface ModulesSummaryItem {
  module: string;
  providers: Array<{ provider: string; enabled: boolean; updatedAt: string }>;
}

export type ModuleKey = 'flights' | 'hotels';

export interface ModuleConfigState {
  name: string;
}

export interface ModulesConfigMap {
  flights: ModuleConfigState;
  hotels: ModuleConfigState;
  order: ModuleKey[];
}

export interface PublicModulesInfo {
  flights: { name: string; enabled: boolean };
  hotels: { name: string; enabled: boolean };
  order: ModuleKey[];
}

export function getModuleConfig() {
  return adminRequest<ModulesConfigMap>('/admin/settings/modules/config');
}

export function setModuleName(module: ModuleKey, name: string) {
  return adminRequest<ModulesConfigMap>(`/admin/settings/modules/config/${module}`, {
    method: 'PUT',
    body: { name },
  });
}

export function setModuleOrder(order: ModuleKey[]) {
  return adminRequest<ModulesConfigMap>('/admin/settings/modules/config/order', {
    method: 'PUT',
    body: { order },
  });
}

export function toggleModuleAll(module: ModuleKey, enabled: boolean) {
  return adminRequest<{ module: ModuleKey; enabled: boolean }>(`/admin/settings/modules/${module}/toggle`, {
    method: 'POST',
    body: { enabled },
  });
}

export interface TravelportProviderConfig {
  module: 'flights';
  provider: 'travelport';
  enabled: boolean;
  updatedAt: string;
  config: {
    environment: 'development' | 'production';
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    accessGroup?: string;
    pcc?: string;
    /** Length hints (not values) so the UI can render length-matched dots */
    passwordLength?: number;
    clientSecretLength?: number;
  };
}

export interface HotelbedsProviderConfig {
  module: 'hotels';
  provider: 'hotelbeds';
  enabled: boolean;
  updatedAt: string;
  config: {
    environment: 'development' | 'production' | 'mtls';
    apiKey?: string;
    secret?: string;
  };
}

export function getModulesSummary() {
  return adminRequest<ModulesSummaryItem[]>('/admin/settings/modules');
}

export function getTravelportProvider() {
  return adminRequest<TravelportProviderConfig>('/admin/settings/modules/flights/providers/travelport');
}

export function setTravelportEnabled(enabled: boolean) {
  return adminRequest<TravelportProviderConfig>(
    '/admin/settings/modules/flights/providers/travelport/enabled',
    { method: 'PUT', body: { enabled } },
  );
}

export function setManualFlightsEnabled(enabled: boolean) {
  return adminRequest<{ module: string; provider: string; enabled: boolean }>(
    '/admin/settings/modules/flights/providers/manual/enabled',
    { method: 'PUT', body: { enabled } },
  );
}

export function setManualHotelsEnabled(enabled: boolean) {
  return adminRequest<{ module: string; provider: string; enabled: boolean }>(
    '/admin/settings/modules/hotels/providers/manual/enabled',
    { method: 'PUT', body: { enabled } },
  );
}

export function setTravelportCredentials(config: TravelportProviderConfig['config']) {
  return adminRequest<TravelportProviderConfig>(
    '/admin/settings/modules/flights/providers/travelport/credentials',
    { method: 'PUT', body: config },
  );
}

export interface ProviderConnectionCheck {
  id: string;
  label: string;
  status: 'success' | 'warning' | 'failed' | 'skipped' | 'info';
  message: string;
  durationMs?: number;
  endpoint?: string;
  method?: string;
  httpStatus?: number;
  safeDetails?: Record<string, unknown>;
}

export interface ProviderConnectionWarning {
  code: string;
  message: string;
}

export interface ProviderConnectionTestResult {
  provider: string;
  module: 'hotels' | 'flights' | 'payments';
  environment: 'sandbox' | 'development' | 'production' | 'mtls' | 'test' | 'unknown';
  success: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: string;
  detectedAccount?: {
    keyId?: string;
    accountType?: string;
    environmentHint?: string;
  };
  checks: ProviderConnectionCheck[];
  warnings: ProviderConnectionWarning[];
}

function normalizeConnectionTestResponse(raw: unknown): ProviderConnectionTestResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid connection test response');
  }

  const record = raw as Record<string, unknown>;

  // Shape 1: Already the rich result (after interceptor + apiRequest unwrap)
  if (typeof record.success === 'boolean' && typeof record.provider === 'string') {
    return record as unknown as ProviderConnectionTestResult;
  }

  // Shape 2: Legacy { ok: true, data: { ...richResult } }
  if (typeof record.ok === 'boolean' && record.data && typeof record.data === 'object') {
    const inner = record.data as Record<string, unknown>;
    if (typeof inner.success === 'boolean' && typeof inner.provider === 'string') {
      return inner as unknown as ProviderConnectionTestResult;
    }
  }

  // Shape 3: Legacy { ok: true, details: { upstreamStatus } }
  if (typeof record.ok === 'boolean') {
    const now = new Date().toISOString();
    return {
      provider: 'unknown',
      module: 'hotels',
      environment: 'unknown',
      success: record.ok,
      startedAt: now,
      completedAt: now,
      durationMs: 0,
      summary: record.ok ? 'Connection verified.' : 'Connection test failed.',
      checks: [
        {
          id: 'legacy-test',
          label: 'Legacy connection test',
          status: record.ok ? 'success' : 'failed',
          message: record.ok
            ? `HTTP ${(record.details as Record<string, unknown> | undefined)?.upstreamStatus ?? 'OK'}: Provider reachable.`
            : 'Provider connection failed.',
          httpStatus: (record.details as Record<string, unknown> | undefined)?.upstreamStatus as number | undefined,
          safeDetails: (record.details as Record<string, unknown>) ?? undefined,
        },
      ],
      warnings: [
        {
          code: 'LEGACY_RESPONSE_SHAPE',
          message: 'Backend returned legacy test response shape. Upgrade backend to rich diagnostics.',
        },
      ],
    };
  }

  throw new Error('Invalid connection test response shape');
}

export function testTravelportConnection() {
  return adminRequest<any>(
    '/admin/settings/modules/flights/providers/travelport/test-connection',
    { method: 'POST' },
  ).then(normalizeConnectionTestResponse);
}

export function getHotelbedsProvider() {
  return adminRequest<HotelbedsProviderConfig>('/admin/settings/modules/hotels/providers/hotelbeds');
}

export function setHotelbedsEnabled(enabled: boolean) {
  return adminRequest<HotelbedsProviderConfig>(
    '/admin/settings/modules/hotels/providers/hotelbeds/enabled',
    { method: 'PUT', body: { enabled } },
  );
}

export function setHotelbedsCredentials(config: HotelbedsProviderConfig['config']) {
  return adminRequest<HotelbedsProviderConfig>(
    '/admin/settings/modules/hotels/providers/hotelbeds/credentials',
    { method: 'PUT', body: config },
  );
}

export function testHotelbedsConnection() {
  return adminRequest<any>(
    '/admin/settings/modules/hotels/providers/hotelbeds/test-connection',
    { method: 'POST' },
  ).then(normalizeConnectionTestResponse);
}

export interface DuffleProviderConfig {
  module: 'flights';
  provider: 'duffel';
  enabled: boolean;
  updatedAt: string;
  config: {
    environment: 'sandbox' | 'production';
    accessToken?: string;
  };
}

export function getDuffleProvider() {
  return adminRequest<DuffleProviderConfig>('/admin/settings/modules/flights/providers/duffel');
}

export function setDuffleEnabled(enabled: boolean) {
  return adminRequest<DuffleProviderConfig>(
    '/admin/settings/modules/flights/providers/duffel/enabled',
    { method: 'PUT', body: { enabled } },
  );
}

export function setDuffleCredentials(config: DuffleProviderConfig['config']) {
  return adminRequest<DuffleProviderConfig>(
    '/admin/settings/modules/flights/providers/duffel/credentials',
    { method: 'PUT', body: config },
  );
}

export function testDuffleConnection() {
  return adminRequest<any>(
    '/admin/settings/modules/flights/providers/duffel/test-connection',
    { method: 'POST' },
  ).then(normalizeConnectionTestResponse);
}

export interface RatehawkProviderConfig {
  module: 'hotels';
  provider: 'ratehawk';
  enabled: boolean;
  updatedAt: string;
  config: {
    environment: 'sandbox' | 'production';
    keyId?: string;
    apiKey?: string;
  };
}

export function getRatehawkProvider() {
  return adminRequest<RatehawkProviderConfig>('/admin/settings/modules/hotels/providers/ratehawk');
}

export function setRatehawkEnabled(enabled: boolean) {
  return adminRequest<RatehawkProviderConfig>(
    '/admin/settings/modules/hotels/providers/ratehawk/enabled',
    { method: 'PUT', body: { enabled } },
  );
}

export function setRatehawkCredentials(config: RatehawkProviderConfig['config']) {
  return adminRequest<RatehawkProviderConfig>(
    '/admin/settings/modules/hotels/providers/ratehawk/credentials',
    { method: 'PUT', body: config },
  );
}

export function testRatehawkConnection() {
  return adminRequest<any>(
    '/admin/settings/modules/hotels/providers/ratehawk/test-connection',
    { method: 'POST' },
  ).then(normalizeConnectionTestResponse);
}

export interface TravelportStaysProviderConfig {
  module: 'hotels';
  provider: 'travelport-stays';
  enabled: boolean;
  updatedAt: string;
  config: {
    environment?: 'development' | 'production';
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    accessGroup?: string;
    pcc?: string;
    gds?: string;
    authUrl?: string;
    baseUrl?: string;
  };
}

export function getTravelportStaysProvider() {
  return adminRequest<TravelportStaysProviderConfig>(
    '/admin/settings/modules/hotels/providers/travelport-stays',
  );
}

export function setTravelportStaysEnabled(enabled: boolean) {
  return adminRequest<TravelportStaysProviderConfig>(
    '/admin/settings/modules/hotels/providers/travelport-stays/enabled',
    { method: 'PUT', body: { enabled } },
  );
}

export function setTravelportStaysCredentials(config: TravelportStaysProviderConfig['config']) {
  return adminRequest<TravelportStaysProviderConfig>(
    '/admin/settings/modules/hotels/providers/travelport-stays/credentials',
    { method: 'PUT', body: config },
  );
}

export function testTravelportStaysConnection() {
  return adminRequest<any>(
    '/admin/settings/modules/hotels/providers/travelport-stays/test-connection',
    { method: 'POST' },
  ).then(normalizeConnectionTestResponse);
}

export interface AmadeusProviderConfig {
  module: 'flights' | 'hotels';
  provider: 'amadeus';
  enabled: boolean;
  updatedAt: string;
  config: {
    environment?: 'test' | 'production';
    clientId?: string;
    clientSecret?: string;
  };
}

export function getAmadeusProvider() {
  return adminRequest<AmadeusProviderConfig>('/admin/settings/modules/flights/providers/amadeus');
}

export function getAmadeusHotelsProvider() {
  return adminRequest<AmadeusProviderConfig>('/admin/settings/modules/hotels/providers/amadeus');
}

export function setAmadeusEnabled(enabled: boolean) {
  return adminRequest<AmadeusProviderConfig>(
    '/admin/settings/modules/flights/providers/amadeus/enabled',
    { method: 'PUT', body: { enabled } },
  );
}

export function setAmadeusHotelsEnabled(enabled: boolean) {
  return adminRequest<AmadeusProviderConfig>(
    '/admin/settings/modules/hotels/providers/amadeus/enabled',
    { method: 'PUT', body: { enabled } },
  );
}

export function setAmadeusCredentials(config: AmadeusProviderConfig['config']) {
  return adminRequest<AmadeusProviderConfig>(
    '/admin/settings/modules/flights/providers/amadeus/credentials',
    { method: 'PUT', body: config },
  );
}

export function setAmadeusHotelsCredentials(config: AmadeusProviderConfig['config']) {
  return adminRequest<AmadeusProviderConfig>(
    '/admin/settings/modules/hotels/providers/amadeus/credentials',
    { method: 'PUT', body: config },
  );
}

export function testAmadeusConnection() {
  return adminRequest<any>(
    '/admin/settings/modules/flights/providers/amadeus/test-connection',
    { method: 'POST' },
  ).then(normalizeConnectionTestResponse);
}

export function testAmadeusHotelsConnection() {
  return adminRequest<any>(
    '/admin/settings/modules/hotels/providers/amadeus/test-connection',
    { method: 'POST' },
  ).then(normalizeConnectionTestResponse);
}

export type FlightsProviderKey = 'travelport' | 'duffel' | 'amadeus' | 'manual';

export interface ProviderMeta {
  label: string;
  description: string;
  docsUrl: string;
  module: 'flights' | 'hotels';
  accent: string;
  accentBg: string;
  accentLight: string;
  accentRing: string;
  gradientFrom: string;
  gradientTo: string;
  tag: string;
  tagValue: string;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  travelport: {
    label: 'Travelport',
    description: 'Global distribution system for flight search, booking, and ticketing.',
    docsUrl: 'https://developer.travelport.com/',
    module: 'flights',
    accent: 'text-flight-600 dark:text-flight-400',
    accentBg: 'bg-flight-50 dark:bg-flight-950/40',
    accentLight: 'bg-flight-100 dark:bg-flight-900/30',
    accentRing: 'ring-flight-200 dark:ring-flight-800/40',
    gradientFrom: 'from-flight-500',
    gradientTo: 'to-flight-600',
    tag: 'UAPI 11',
    tagValue: '1G Galileo',
  },
  'travelport-stays': {
    label: 'Travelport Stays',
    description: 'Travelport hotel inventory — search, availability, and reservation management.',
    docsUrl: 'https://developer.travelport.com/',
    module: 'hotels',
    accent: 'text-hotel-600 dark:text-hotel-400',
    accentBg: 'bg-hotel-50 dark:bg-hotel-950/40',
    accentLight: 'bg-hotel-100 dark:bg-hotel-900/30',
    accentRing: 'ring-hotel-200 dark:ring-hotel-800/40',
    gradientFrom: 'from-hotel-500',
    gradientTo: 'to-hotel-600',
    tag: 'Stays v11',
    tagValue: 'Hotels 11',
  },
  hotelbeds: {
    label: 'Hotelbeds',
    description: 'Bed bank aggregator for hotel inventory, rates, and booking.',
    docsUrl: 'https://developer.hotelbeds.com/',
    module: 'hotels',
    accent: 'text-hotel-600 dark:text-hotel-400',
    accentBg: 'bg-hotel-50 dark:bg-hotel-950/40',
    accentLight: 'bg-hotel-100 dark:bg-hotel-900/30',
    accentRing: 'ring-hotel-200 dark:ring-hotel-800/40',
    gradientFrom: 'from-hotel-500',
    gradientTo: 'to-hotel-600',
    tag: 'API 2.0',
    tagValue: 'Bed Bank',
  },
  ratehawk: {
    label: 'RateHawk',
    description: 'Travel API for hotel, flight, and car rental inventory with competitive rates.',
    docsUrl: 'https://docs.emergingtravel.com/docs/b2b-api/',
    module: 'hotels',
    accent: 'text-cyan-600 dark:text-cyan-400',
    accentBg: 'bg-cyan-50 dark:bg-cyan-950/40',
    accentLight: 'bg-cyan-100 dark:bg-cyan-900/30',
    accentRing: 'ring-cyan-200 dark:ring-cyan-800/40',
    gradientFrom: 'from-cyan-500',
    gradientTo: 'to-cyan-600',
    tag: 'API v3',
    tagValue: 'Travel Aggregator',
  },
  duffel: {
    label: 'Duffle',
    description: 'Modern flight API for search, offers, and booking. Direct NDC-style content.',
    docsUrl: 'https://duffel.com/docs',
    module: 'flights',
    accent: 'text-indigo-600 dark:text-indigo-400',
    accentBg: 'bg-indigo-50 dark:bg-indigo-950/40',
    accentLight: 'bg-indigo-100 dark:bg-indigo-900/30',
    accentRing: 'ring-indigo-200 dark:ring-indigo-800/40',
    gradientFrom: 'from-indigo-500',
    gradientTo: 'to-purple-600',
    tag: 'API v2',
    tagValue: 'Flight API',
  },
  amadeus: {
    label: 'Amadeus',
    description: 'Enterprise flight APIs for search, pricing, booking, ticketing, seat maps, and order management.',
    docsUrl: 'https://developers.amadeus.com/',
    module: 'flights',
    accent: 'text-amber-600 dark:text-amber-400',
    accentBg: 'bg-amber-50 dark:bg-amber-950/40',
    accentLight: 'bg-amber-100 dark:bg-amber-900/30',
    accentRing: 'ring-amber-200 dark:ring-amber-800/40',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-orange-600',
    tag: 'Enterprise',
    tagValue: 'Flight APIs',
  },
  manual: {
    label: 'Manual',
    description: 'Admin-managed inventory — not connected to any external supplier API.',
    docsUrl: '',
    module: 'flights',
    accent: 'text-emerald-600 dark:text-emerald-400',
    accentBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    accentLight: 'bg-emerald-100 dark:bg-emerald-900/30',
    accentRing: 'ring-emerald-200 dark:ring-emerald-800/40',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-teal-600',
    tag: 'Manual',
    tagValue: 'Admin',
  },
} as const;

export type ProviderKey = keyof typeof PROVIDER_META;

export function getProviderMeta<K extends ProviderKey>(key: K): (typeof PROVIDER_META)[K] {
  return PROVIDER_META[key];
}

export function getProviderDocsUrl(key: ProviderKey): string {
  return PROVIDER_META[key].docsUrl;
}

// ── General / Site Settings ──

export interface HeroBackgrounds {
  flights?: string | null;
  hotels?: string | null;
}

export interface SiteBranding {
  logo?: string | null;
  favicon?: string | null;
}

export interface GeneralSettings {
  guestBookingEnabled: boolean;
  showPriceBreakdown: boolean;
  heroBackgrounds?: HeroBackgrounds;
  branding?: SiteBranding;
  siteTitle?: string | null;
  siteDescription?: string | null;
  /** False = admin must issue held bookings manually. Default true. */
  bookingCustomerConfirm?: boolean;
}

export function getGeneralSettings() {
  return adminRequest<GeneralSettings>('/admin/settings/general');
}

/** Public — site-wide brand assets (logo + favicon URLs). {} = use defaults. */
export function getSiteBranding() {
  return apiRequest<{ branding: SiteBranding }>('/settings/branding');
}

export function updateGeneralSetting(key: string, value: unknown) {
  return adminRequest<{ success: boolean; key: string; value: unknown }>(
    '/admin/settings/general',
    { method: 'PATCH', body: { key, value } },
  );
}

/** Public endpoint — no auth required. Used by checkout pages. */
export function getGuestBookingStatus() {
  return apiRequest<{ enabled: boolean }>('/settings/guest-booking');
}

/** Public — whether the admin price-breakdown toggle is ON. */
export function getPriceBreakdownSetting() {
  return apiRequest<{ showPriceBreakdown: boolean }>('/settings/price-breakdown');
}

/** Public — admin-curated hero backgrounds per module ({} = use defaults). */

/**
 * Upload an image to Cloudinary via the admin upload endpoint (multipart —
 * bypasses the JSON apiRequest wrapper). Returns the secure CDN URL.
 */
export async function uploadHeroImage(file: File): Promise<string> {
  const { refreshAuthToken } = await import('@/lib/api/client');
  const { getAccessToken } = await import('@/lib/auth/storage');
  const { NEXT_PUBLIC_API_BASE_URL } = getPublicEnv();

  const send = async (token: string, signal?: AbortSignal) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${NEXT_PUBLIC_API_BASE_URL}/admin/upload/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal,
    });
  };

  // Bound the request — a stalled socket must not leave the UI stuck forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  const token = getAccessToken();
  let res = token ? await send(token, controller.signal) : null;

  if (!res) {
    const ok = await refreshAuthToken();
    if (!ok) throw new Error('Session expired — please sign in again.');
    const fresh = getAccessToken();
    if (!fresh) throw new Error('Session expired — please sign in again.');
    res = await send(fresh, controller.signal);
  } else if (res.status === 401) {
    const ok = await refreshAuthToken();
    if (!ok) throw new Error('Session expired — please sign in again.');
    const fresh = getAccessToken();
    if (!fresh) throw new Error('Session expired — please sign in again.');
    res = await send(fresh, controller.signal);
  }

  clearTimeout(timer);

  // Surface the ACTUAL server error instead of a generic message.
  const text = await res.text().catch(() => '');
  let message = 'Image upload failed.';
  try {
    const data = text ? (JSON.parse(text) as { message?: string }) : null;
    if (data?.message) message = data.message;
  } catch {
    if (text.trim()) message = text.trim().slice(0, 200);
  }
  if (!res.ok) {
    throw new Error(`${message} (HTTP ${res.status})`);
  }
  try {
    // Standard envelope: { success, statusCode, message, data: { url } } — but
    // accept a bare { url } too, in case the envelope changes.
    const data = JSON.parse(text) as { url?: string; data?: { url?: string } };
    const url = data?.data?.url ?? data?.url;
    if (!url) throw new Error('Missing image URL in response.');
    return url;
  } catch {
    throw new Error(`${message} (HTTP ${res.status})`);
  }
}

/**
 * Cloudinary delivery optimization — swaps in f_auto (WebP/AVIF when the
 * browser supports it) + q_auto (perceptual quality) + w_1920 width cap.
 * Originals are often 4000px+ (a 1.3MB hero); capping at 1920px keeps heroes
 * sharp on all screens while cutting ~2/3 of the bytes. Smaller images pass
 * through at native size (c_limit never upscales). Non-Cloudinary URLs pass
 * through unchanged.
 */
export function optimizedImageUrl(url: string, width = 1920): string {
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  if (/\/upload\/f_auto/.test(url)) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},c_limit/`);
}
