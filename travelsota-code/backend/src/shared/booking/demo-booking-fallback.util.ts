import { randomBytes } from 'node:crypto';

/**
 * Shared "fake booking" fallback for demo/guest sessions.
 *
 * When a real supplier (GDS/NDC) booking fails for a demo account or a guest
 * session in demo mode, the customer sees a smooth success page with a fake,
 * clearly-marked PNR instead of the real error. The real super admin
 * (REAL_ADMIN_EMAIL) always sees the real failure, and payment failures are
 * never faked for anyone — this only covers supplier-side booking failures
 * that happen after payment already succeeded (or before any charge, at the
 * pre-payment fare-check step).
 *
 * Reuses the same conventions already used elsewhere in this codebase:
 * - REAL_ADMIN_EMAIL / DEMO_UI_ENABLED — see demo-leads/api/real-admin.guard.ts
 * - DEMO_MODE_EMAILS / DEMO_MODE_ENABLED — see hotel-booking.service.ts,
 *   admin-provider-settings.controller.ts
 */

function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isRealAdminEmail(email?: string | null): boolean {
  const target = (process.env.REAL_ADMIN_EMAIL || 'superadmin@travelsota-dev.local')
    .trim()
    .toLowerCase();
  return (email ?? '').trim().toLowerCase() === target;
}

export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE_ENABLED === 'true';
}

export function isDemoModeEmail(email?: string | null): boolean {
  const demoEmails = parseEmailList(process.env.DEMO_MODE_EMAILS);
  if (!email || demoEmails.length === 0) return false;
  return demoEmails.includes(email.trim().toLowerCase());
}

/** Master switch for the whole fake-booking mechanism (default: on, only while demo mode is on). */
export function isFakeBookingFallbackEnabled(): boolean {
  const raw = process.env.ENABLE_FAKE_BOOKING_FALLBACK;
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  // No explicit override — follow DEMO_MODE_ENABLED.
  return isDemoModeEnabled();
}

/**
 * Whether this booking's owner qualifies for the fake-success fallback.
 * `userEmail` is the account email for an authenticated booking (undefined
 * for guest checkouts). The real admin is excluded even if their email
 * somehow also appears in DEMO_MODE_EMAILS — real admin always wins.
 */
export function isFakeEligibleBooking(params: {
  userEmail?: string | null;
  isGuest: boolean;
}): boolean {
  if (!isFakeBookingFallbackEnabled()) return false;
  if (isRealAdminEmail(params.userEmail)) return false;
  if (params.isGuest) return isDemoModeEnabled();
  return isDemoModeEmail(params.userEmail);
}

/**
 * Travelport (GDS flights) and Travelport Stays currently have very little
 * real supplier inventory, so — unlike the generic demo-list-based rule
 * above — every non-admin session is fake-eligible for these two providers,
 * not just seeded demo accounts and guests. This is a separate, wider
 * switch: TRAVELPORT_FAKE_BOOKING_ENABLED=true fakes confirm-step failures
 * for everyone except REAL_ADMIN_EMAIL; =false (or unset) means real
 * bookings for everyone, full stop — it does NOT fall back to
 * ENABLE_FAKE_BOOKING_FALLBACK/DEMO_MODE_ENABLED the way other providers do.
 */
export function isTravelportFakeBookingEnabled(): boolean {
  return process.env.TRAVELPORT_FAKE_BOOKING_ENABLED === 'true';
}

/** Travelport/Travelport Stays fake-eligibility: everyone except the real admin, gated only by TRAVELPORT_FAKE_BOOKING_ENABLED. */
export function isTravelportFakeEligible(userEmail?: string | null): boolean {
  return (
    isTravelportFakeBookingEnabled() && !isRealAdminEmail(userEmail)
  );
}

const PROVIDER_CODES: Record<string, string> = {
  travelport: 'TP',
  'travelport-stays': 'TS',
  duffel: 'DU',
  amadeus: 'AM',
};

/** Providers whose fake PNR mimics the real 6-char GDS shape (see generateFakePnr). */
const REALISH_FAKE_PNR_PROVIDERS = new Set(['travelport', 'travelport-stays']);
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomAlnum(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALNUM[bytes[i] % ALNUM.length];
  return out;
}

/**
 * Generates a fake PNR.
 *
 * Travelport / Travelport Stays: a customer-facing, 6-character uppercase
 * alphanumeric code with no separator — the same shape as a real GDS locator
 * (e.g. "HN4VTH") — so it never looks broken to a customer. The hint is the
 * fixed 2-letter prefix (TP/TS, from PROVIDER_CODES): staff who know the
 * convention recognize it at a glance; a real locator coincidentally starting
 * with the same 2 letters is possible but very unlikely (~1/1296). The
 * authoritative fake-marker stays the `demoMode` flag on the booking
 * (see hasFakeBookingFlag/withFakeBookingAudit) — isFakeLocatorCode below is
 * a best-effort check for places that only have the bare reference string.
 *
 * Every other provider keeps the old, unmistakably-fake shape: real GDS/NDC
 * locator codes are always slash-free, so a "/" alone means fake.
 */
export function generateFakePnr(provider: string): string {
  const code = PROVIDER_CODES[provider] ?? provider.slice(0, 2).toUpperCase();
  if (REALISH_FAKE_PNR_PROVIDERS.has(provider)) {
    return `${code}${randomAlnum(4)}`;
  }
  const suffix = randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `${code}-DEV/${suffix}`;
}

/**
 * Generates a fake PNR for a Travelport offer/hold that expired before it
 * could be ticketed (session cache expired, or the supplier workflow had no
 * catalog data left to confirm against). Same slash-delimited shape as
 * generateFakePnr() (so isFakeLocatorCode() still recognizes it, and the
 * admin/agent/customer reference column always shows this instead of the
 * previous non-random "IKF<bookingId>" placeholder) but tagged "EXP" instead
 * of "DEV" so it's identifiable at a glance as an expired-offer placeholder
 * rather than a demo-fallback booking.
 */
export function generateExpiredPnr(provider: string): string {
  const code = PROVIDER_CODES[provider] ?? provider.slice(0, 2).toUpperCase();
  const suffix = randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `${code}-EXP/${suffix}`;
}

/** Matches the Travelport/Travelport Stays "real-shaped" fake PNR — see generateFakePnr. */
const REALISH_FAKE_PNR_PATTERN = /^(?:TP|TS)[A-Z0-9]{4}$/;

export function isFakeLocatorCode(locatorCode?: string | null): boolean {
  if (!locatorCode) return false;
  return locatorCode.includes('/') || REALISH_FAKE_PNR_PATTERN.test(locatorCode);
}

/** Reads the demoMode flag out of a booking's workflowSummary JSON blob. */
export function hasFakeBookingFlag(workflowSummary?: unknown): boolean {
  return (
    !!workflowSummary &&
    typeof workflowSummary === 'object' &&
    (workflowSummary as Record<string, unknown>).demoMode === true
  );
}

/** True if this booking is a fake/demo booking by either signal. */
export function isFakeBooking(booking: {
  workflowSummary?: unknown;
  locatorCode?: string | null;
}): boolean {
  return (
    hasFakeBookingFlag(booking.workflowSummary) ||
    isFakeLocatorCode(booking.locatorCode)
  );
}

/** Merges the demoMode flag + real-failure audit trail into an existing workflowSummary blob. */
export function withFakeBookingAudit(
  workflowSummary: unknown,
  realFailure: { status?: string; message?: string },
): Record<string, unknown> {
  const base =
    workflowSummary && typeof workflowSummary === 'object'
      ? (workflowSummary as Record<string, unknown>)
      : {};
  return {
    ...base,
    demoMode: true,
    realFailure: {
      status: realFailure.status ?? 'failed_supplier_booking',
      message: realFailure.message ?? 'Supplier booking failed.',
      at: new Date().toISOString(),
    },
  };
}
