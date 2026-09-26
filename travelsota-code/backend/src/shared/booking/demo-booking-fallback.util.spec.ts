import {
  isRealAdminEmail,
  isDemoModeEnabled,
  isDemoModeEmail,
  isFakeBookingFallbackEnabled,
  isFakeEligibleBooking,
  isTravelportFakeBookingEnabled,
  isTravelportFakeEligible,
  generateFakePnr,
  isFakeLocatorCode,
  hasFakeBookingFlag,
  isFakeBooking,
  withFakeBookingAudit,
} from './demo-booking-fallback.util';

describe('demo-booking-fallback.util', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('isRealAdminEmail', () => {
    it('matches the default real admin email when REAL_ADMIN_EMAIL is unset', () => {
      delete process.env.REAL_ADMIN_EMAIL;
      expect(isRealAdminEmail('superadmin@travelsota-dev.local')).toBe(true);
      expect(isRealAdminEmail('FAISAL@travelsota.com')).toBe(true);
      expect(isRealAdminEmail('someone-else@travelsota.com')).toBe(false);
    });

    it('matches a configured REAL_ADMIN_EMAIL', () => {
      process.env.REAL_ADMIN_EMAIL = 'owner@example.com';
      expect(isRealAdminEmail('owner@example.com')).toBe(true);
      expect(isRealAdminEmail('superadmin@travelsota-dev.local')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isRealAdminEmail(undefined)).toBe(false);
      expect(isRealAdminEmail(null)).toBe(false);
    });
  });

  describe('isDemoModeEnabled / isDemoModeEmail', () => {
    it('reflects DEMO_MODE_ENABLED', () => {
      process.env.DEMO_MODE_ENABLED = 'true';
      expect(isDemoModeEnabled()).toBe(true);
      process.env.DEMO_MODE_ENABLED = 'false';
      expect(isDemoModeEnabled()).toBe(false);
    });

    it('matches emails from DEMO_MODE_EMAILS (case-insensitive, trimmed)', () => {
      process.env.DEMO_MODE_EMAILS = 'admin@travelsota.com, agent@travelsota.com';
      expect(isDemoModeEmail('AGENT@travelsota.com')).toBe(true);
      expect(isDemoModeEmail('customer@travelsota.com')).toBe(false);
    });

    it('returns false when DEMO_MODE_EMAILS is empty/unset', () => {
      delete process.env.DEMO_MODE_EMAILS;
      expect(isDemoModeEmail('admin@travelsota.com')).toBe(false);
    });
  });

  describe('isFakeBookingFallbackEnabled', () => {
    it('follows DEMO_MODE_ENABLED when no explicit override is set', () => {
      delete process.env.ENABLE_FAKE_BOOKING_FALLBACK;
      process.env.DEMO_MODE_ENABLED = 'true';
      expect(isFakeBookingFallbackEnabled()).toBe(true);
      process.env.DEMO_MODE_ENABLED = 'false';
      expect(isFakeBookingFallbackEnabled()).toBe(false);
    });

    it('an explicit false always wins (kill switch)', () => {
      process.env.DEMO_MODE_ENABLED = 'true';
      process.env.ENABLE_FAKE_BOOKING_FALLBACK = 'false';
      expect(isFakeBookingFallbackEnabled()).toBe(false);
    });

    it('an explicit true works even if DEMO_MODE_ENABLED is false', () => {
      process.env.DEMO_MODE_ENABLED = 'false';
      process.env.ENABLE_FAKE_BOOKING_FALLBACK = 'true';
      expect(isFakeBookingFallbackEnabled()).toBe(true);
    });
  });

  describe('isFakeEligibleBooking', () => {
    beforeEach(() => {
      process.env.DEMO_MODE_ENABLED = 'true';
      process.env.DEMO_MODE_EMAILS = 'admin@travelsota.com,agent@travelsota.com,customer@travelsota.com';
      delete process.env.REAL_ADMIN_EMAIL; // defaults to superadmin@travelsota-dev.local
      delete process.env.ENABLE_FAKE_BOOKING_FALLBACK;
    });

    it('is eligible for a demo-account email', () => {
      expect(
        isFakeEligibleBooking({ userEmail: 'admin@travelsota.com', isGuest: false }),
      ).toBe(true);
    });

    it('is eligible for a guest session when demo mode is on', () => {
      expect(isFakeEligibleBooking({ userEmail: undefined, isGuest: true })).toBe(true);
    });

    it('is NOT eligible for the real super admin, even as a "guest" flag or demo email', () => {
      expect(
        isFakeEligibleBooking({ userEmail: 'superadmin@travelsota-dev.local', isGuest: false }),
      ).toBe(false);
    });

    it('is NOT eligible for a real authenticated customer not on the demo list', () => {
      expect(
        isFakeEligibleBooking({ userEmail: 'real.customer@example.com', isGuest: false }),
      ).toBe(false);
    });

    it('is NOT eligible for anyone when the kill switch is off', () => {
      process.env.ENABLE_FAKE_BOOKING_FALLBACK = 'false';
      expect(
        isFakeEligibleBooking({ userEmail: 'admin@travelsota.com', isGuest: false }),
      ).toBe(false);
      expect(isFakeEligibleBooking({ userEmail: undefined, isGuest: true })).toBe(false);
    });

    it('is NOT eligible for a guest session when demo mode is off', () => {
      process.env.DEMO_MODE_ENABLED = 'false';
      expect(isFakeEligibleBooking({ userEmail: undefined, isGuest: true })).toBe(false);
    });
  });

  describe('isTravelportFakeBookingEnabled / isTravelportFakeEligible', () => {
    afterEach(() => {
      delete process.env.TRAVELPORT_FAKE_BOOKING_ENABLED;
      delete process.env.REAL_ADMIN_EMAIL;
    });

    it('is disabled by default (unset)', () => {
      delete process.env.TRAVELPORT_FAKE_BOOKING_ENABLED;
      expect(isTravelportFakeBookingEnabled()).toBe(false);
    });

    it('turns on only with an explicit "true"', () => {
      process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'true';
      expect(isTravelportFakeBookingEnabled()).toBe(true);
    });

    it('is eligible for a real, non-demo, logged-in customer when enabled (unlike the generic rule)', () => {
      process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'true';
      expect(isTravelportFakeEligible('real.customer@example.com')).toBe(true);
    });

    it('is eligible for a guest (no email) when enabled', () => {
      process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'true';
      expect(isTravelportFakeEligible(undefined)).toBe(true);
    });

    it('is never eligible for the real super admin, even when enabled', () => {
      process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'true';
      expect(isTravelportFakeEligible('superadmin@travelsota-dev.local')).toBe(false);
    });

    it('is not eligible for anyone when disabled — real bookings for all', () => {
      process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'false';
      expect(isTravelportFakeEligible('real.customer@example.com')).toBe(false);
      expect(isTravelportFakeEligible(undefined)).toBe(false);
    });

    it('does not fall back to DEMO_MODE_ENABLED — it is a standalone switch', () => {
      process.env.DEMO_MODE_ENABLED = 'true';
      delete process.env.TRAVELPORT_FAKE_BOOKING_ENABLED;
      expect(isTravelportFakeEligible('real.customer@example.com')).toBe(false);
    });
  });

  describe('generateFakePnr / isFakeLocatorCode', () => {
    it('generates a slash-delimited fake PNR for providers other than Travelport', () => {
      const pnr = generateFakePnr('amadeus');
      expect(pnr).toMatch(/^AM-DEV\/[0-9A-F]{6}$/);
      expect(isFakeLocatorCode(pnr)).toBe(true);
    });

    it('falls back to a 2-letter code for unknown providers', () => {
      const pnr = generateFakePnr('unknownprovider');
      expect(pnr.startsWith('UN-DEV/')).toBe(true);
    });

    it('generates a real-shaped, slash-free, 6-char PNR for travelport (flights)', () => {
      const pnr = generateFakePnr('travelport');
      expect(pnr).toMatch(/^TP[A-Z0-9]{4}$/);
      expect(pnr).not.toContain('/');
      expect(isFakeLocatorCode(pnr)).toBe(true);
    });

    it('generates a real-shaped, slash-free, 6-char PNR for travelport-stays', () => {
      const pnr = generateFakePnr('travelport-stays');
      expect(pnr).toMatch(/^TS[A-Z0-9]{4}$/);
      expect(isFakeLocatorCode(pnr)).toBe(true);
    });

    it('treats a genuinely real-looking locator code as not fake', () => {
      expect(isFakeLocatorCode('HN4VTH')).toBe(false);
      expect(isFakeLocatorCode(null)).toBe(false);
      expect(isFakeLocatorCode(undefined)).toBe(false);
    });
  });

  describe('hasFakeBookingFlag / isFakeBooking / withFakeBookingAudit', () => {
    it('detects the demoMode flag inside workflowSummary', () => {
      expect(hasFakeBookingFlag({ demoMode: true })).toBe(true);
      expect(hasFakeBookingFlag({ demoMode: false })).toBe(false);
      expect(hasFakeBookingFlag(undefined)).toBe(false);
    });

    it('isFakeBooking is true via either the flag or the locator format', () => {
      expect(isFakeBooking({ workflowSummary: { demoMode: true }, locatorCode: 'HN4VTH' })).toBe(true);
      expect(isFakeBooking({ workflowSummary: undefined, locatorCode: 'TP-DEV/ABC123' })).toBe(true);
      expect(isFakeBooking({ workflowSummary: undefined, locatorCode: 'HN4VTH' })).toBe(false);
    });

    it('withFakeBookingAudit sets demoMode and preserves existing summary keys', () => {
      const result = withFakeBookingAudit(
        { supplierBookingId: 'wb-1' },
        { status: 'failed_supplier_booking', message: 'FLIGHT CAN NOT BE BOARDED AT THIS CITY' },
      );
      expect(result.demoMode).toBe(true);
      expect(result.supplierBookingId).toBe('wb-1');
      expect((result.realFailure as any).status).toBe('failed_supplier_booking');
      expect((result.realFailure as any).message).toBe('FLIGHT CAN NOT BE BOARDED AT THIS CITY');
    });
  });
});
