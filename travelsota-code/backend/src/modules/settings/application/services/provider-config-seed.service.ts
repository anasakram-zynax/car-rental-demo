import { Injectable, Logger } from '@nestjs/common';
import { ProviderConfigService } from './provider-config.service';
import type {
  TravelportFlightsConfig,
  TravelportStaysHotelsConfig,
  DuffleFlightsConfig,
  HotelbedsHotelsConfig,
  AmadeusFlightsConfig,
  AmadeusHotelsConfig,
} from '../../domain/provider-config.entity';

@Injectable()
export class ProviderConfigSeedService {
  private readonly logger = new Logger(ProviderConfigSeedService.name);

  constructor(private readonly providerConfigService: ProviderConfigService) {}

  async ensureSeed(): Promise<void> {
    await this.seedFlightsTravelport();
    await this.seedFlightsDuffel();
    await this.seedFlightsAmadeus();
    await this.seedHotelsHotelbeds();
    await this.seedHotelsAmadeus();
    await this.seedHotelsTravelportStays();
    await this.ensureTravelportStaysBookingEnabled();
    await this.ensureHotelsAmadeusBookingEnabled();
    await this.ensureHotelsRatehawkBookingEnabled();
    await this.ensureFlightsDuffelBookingEnabled();
    await this.ensureFlightsAmadeusBookingEnabled();
    await this.ensureFlightsTravelportBookingEnabled();
    await this.ensureManualHotelsEnabled();
    await this.ensureManualFlightsEnabled();
  }

  private async seedFlightsTravelport(): Promise<void> {
    let exists = true;
    try {
      await this.providerConfigService.getFlightsProvider('travelport');
    } catch {
      exists = false;
    }
    if (exists) return;

    const cfg: TravelportFlightsConfig = {
      environment: 'development',
      authUrl: 'https://auth.pp.travelport.net/oauth/token',
      baseUrl: 'https://api.pp.travelport.net',
      acceptVersion: process.env.TRAVELPORT_ACCEPT_VERSION ?? '11',
      contentVersion: process.env.TRAVELPORT_CONTENT_VERSION ?? '11',
      requestTimeoutMs: Number(
        process.env.TRAVELPORT_REQUEST_TIMEOUT_MS ?? 45000,
      ),
      oauthGrantType: process.env.TRAVELPORT_OAUTH_GRANT_TYPE ?? 'password',
      oauthClientAuthMode:
        (process.env.TRAVELPORT_OAUTH_CLIENT_AUTH_MODE as 'basic' | 'body') ??
        'basic',
      includeAccessGroupInToken:
        String(
          process.env.TRAVELPORT_INCLUDE_ACCESS_GROUP_IN_TOKEN ?? 'false',
        ).toLowerCase() === 'true',
      username: process.env.TRAVELPORT_USERNAME,
      password: process.env.TRAVELPORT_PASSWORD,
      clientId: process.env.TRAVELPORT_CLIENT_ID,
      clientSecret: process.env.TRAVELPORT_CLIENT_SECRET,
      accessGroup: process.env.TRAVELPORT_ACCESS_GROUP,
      pcc: process.env.TRAVELPORT_PCC,
      gds: process.env.TRAVELPORT_GDS ?? '1G',
      defaultContentSourceList: ['GDS', 'NDC'],
    };

    await this.providerConfigService.seedFlightsProvider(
      'travelport',
      cfg,
      true,
    );
    this.logger.log('Seeded flights.travelport provider config.');
  }

  private async seedFlightsDuffel(): Promise<void> {
    let exists = true;
    try {
      await this.providerConfigService.getFlightsProvider('duffel');
    } catch {
      exists = false;
    }
    if (exists) return;

    const cfg: DuffleFlightsConfig = {
      environment: 'sandbox',
      baseUrl: 'https://api.duffel.com',
      accessToken: process.env.DUFFEL_ACCESS_TOKEN ?? '',
      duffelVersion: process.env.DUFFEL_API_VERSION ?? 'v2',
      requestTimeoutMs: Number(process.env.DUFFEL_REQUEST_TIMEOUT_MS ?? 60000),
      searchEnabled: true,
      bookingEnabled: false,
      priority: 0,
    };

    await this.providerConfigService.seedFlightsProvider('duffel', cfg, false);
    this.logger.log('Seeded flights.duffel provider config.');
  }

  private async seedHotelsHotelbeds(): Promise<void> {
    let exists = true;
    try {
      await this.providerConfigService.getHotelsProvider('hotelbeds');
    } catch {
      exists = false;
    }
    if (exists) return;

    const cfg: HotelbedsHotelsConfig = {
      environment: 'development',
      endpoint:
        process.env.HOTELBEDS_ENDPOINT ?? 'https://api.test.hotelbeds.com',
      apiKey: process.env.HOTELBEDS_API_KEY ?? '',
      secret: process.env.HOTELBEDS_SECRET ?? '',
      requestTimeoutMs: Number(
        process.env.HOTELBEDS_REQUEST_TIMEOUT_MS ?? 45000,
      ),
    };

    await this.providerConfigService.seedHotelsProvider('hotelbeds', cfg, true);
    this.logger.log('Seeded hotels.hotelbeds provider config.');
  }

  private async seedFlightsAmadeus(): Promise<void> {
    let exists = true;
    try {
      await this.providerConfigService.getFlightsProvider('amadeus');
    } catch {
      exists = false;
    }
    if (exists) return;

    const cfg: AmadeusFlightsConfig = {
      environment:
        (process.env.AMADEUS_ENVIRONMENT as 'test' | 'production') ?? 'test',
      authUrl:
        process.env.AMADEUS_AUTH_URL ??
        'https://test.travel.api.amadeus.com/v1/security/oauth2/token',
      baseUrl:
        process.env.AMADEUS_BASE_URL ?? 'https://test.travel.api.amadeus.com',
      clientId: process.env.AMADEUS_CLIENT_ID ?? '',
      clientSecret: process.env.AMADEUS_CLIENT_SECRET ?? '',
      officeId: process.env.AMADEUS_OFFICE_ID ?? '',
      source: process.env.AMADEUS_SOURCE ?? '',
      requestTimeoutMs: Number(process.env.AMADEUS_REQUEST_TIMEOUT_MS ?? 30000),
      searchEnabled: true,
      bookingEnabled: false,
      ticketingEnabled: false,
      seatMapEnabled: false,
      brandedFaresEnabled: false,
      queueEnabled: false,
      priority: 0,
    };

    await this.providerConfigService.seedFlightsProvider('amadeus', cfg, false);
    this.logger.log('Seeded flights.amadeus provider config (disabled).');
  }

  private async seedHotelsAmadeus(): Promise<void> {
    let exists = true;
    try {
      await this.providerConfigService.getHotelsProvider('amadeus');
    } catch {
      exists = false;
    }
    if (exists) return;

    const cfg: AmadeusHotelsConfig = {
      environment:
        (process.env.AMADEUS_HOTELS_ENVIRONMENT as 'test' | 'production') ??
        'test',
      authUrl:
        process.env.AMADEUS_HOTELS_AUTH_URL ??
        'https://test.travel.api.amadeus.com/v1/security/oauth2/token',
      baseUrl:
        process.env.AMADEUS_HOTELS_BASE_URL ??
        'https://test.travel.api.amadeus.com',
      clientId:
        process.env.AMADEUS_HOTELS_CLIENT_ID ??
        process.env.AMADEUS_CLIENT_ID ??
        '',
      clientSecret:
        process.env.AMADEUS_HOTELS_CLIENT_SECRET ??
        process.env.AMADEUS_CLIENT_SECRET ??
        '',
      requestTimeoutMs: Number(
        process.env.AMADEUS_HOTELS_REQUEST_TIMEOUT_MS ?? 30000,
      ),
      searchEnabled: true,
      bookingEnabled: true,
      priority: 0,
    };

    await this.providerConfigService.seedHotelsProvider('amadeus', cfg, false);
    this.logger.log('Seeded hotels.amadeus provider config.');
  }

  private async seedHotelsTravelportStays(): Promise<void> {
    let exists = true;
    try {
      await this.providerConfigService.getHotelsProvider('travelport-stays');
    } catch {
      exists = false;
    }
    if (exists) return;

    const cfg: TravelportStaysHotelsConfig = {
      environment: 'development',
      authUrl:
        process.env.TRAVELPORT_STAYS_AUTH_URL ??
        process.env.TRAVELPORT_AUTH_URL ??
        'https://auth.pp.travelport.net/oauth/token',
      baseUrl:
        process.env.TRAVELPORT_STAYS_BASE_URL ??
        process.env.TRAVELPORT_BASE_URL ??
        'https://api.pp.travelport.net',
      acceptVersion: process.env.TRAVELPORT_STAYS_ACCEPT_VERSION ?? '11',
      contentVersion: process.env.TRAVELPORT_STAYS_CONTENT_VERSION ?? '11',
      requestTimeoutMs: Number(
        process.env.TRAVELPORT_STAYS_REQUEST_TIMEOUT_MS ?? 30000,
      ),
      oauthGrantType:
        process.env.TRAVELPORT_STAYS_OAUTH_GRANT_TYPE ?? 'password',
      oauthClientAuthMode:
        (process.env.TRAVELPORT_STAYS_OAUTH_CLIENT_AUTH_MODE as
          | 'basic'
          | 'body') ?? 'body',
      includeAccessGroupInToken:
        String(
          process.env.TRAVELPORT_STAYS_INCLUDE_ACCESS_GROUP_IN_TOKEN ?? 'false',
        ).toLowerCase() === 'true',
      username:
        process.env.TRAVELPORT_STAYS_USERNAME ??
        process.env.TRAVELPORT_USERNAME,
      password:
        process.env.TRAVELPORT_STAYS_PASSWORD ??
        process.env.TRAVELPORT_PASSWORD,
      clientId:
        process.env.TRAVELPORT_STAYS_CLIENT_ID ??
        process.env.TRAVELPORT_CLIENT_ID,
      clientSecret:
        process.env.TRAVELPORT_STAYS_CLIENT_SECRET ??
        process.env.TRAVELPORT_CLIENT_SECRET,
      accessGroup:
        process.env.TRAVELPORT_STAYS_ACCESS_GROUP ??
        process.env.TRAVELPORT_ACCESS_GROUP,
      pcc: process.env.TRAVELPORT_STAYS_PCC ?? process.env.TRAVELPORT_PCC,
      gds: process.env.TRAVELPORT_STAYS_GDS ?? '1G',
      searchEnabled: true,
      bookingEnabled: false,
      priority: 0,
    };

    await this.providerConfigService.seedHotelsProvider(
      'travelport-stays',
      cfg,
      false,
    );
    this.logger.log('Seeded hotels.travelport-stays provider config.');
  }

  /**
   * Travelport Stays hotel bookings shipped with `bookingEnabled: false`
   * (safety default while search/details/rate-validation were still being
   * verified against the live sandbox). Flip it to true now that the full
   * flow — search, details, rate validation — has been live-QA'd end to end.
   */
  private async ensureTravelportStaysBookingEnabled(): Promise<void> {
    const row = await this.providerConfigService
      .getHotelsTravelportStays()
      .catch(() => null);
    if (!row) return;
    const cfg = row.config as unknown as Record<string, unknown>;
    if (cfg.bookingEnabled === true) return;
    await this.providerConfigService.setHotelsTravelportStaysConfig({
      ...row.config,
      bookingEnabled: true,
    });
    this.logger.log(
      'Enabled hotels.travelport-stays booking (bookingEnabled → true).',
    );
  }

  /**
   * Amadeus hotel bookings were shipped with `bookingEnabled: false`. Flip it
   * to true on existing rows (idempotent, merge keeps other fields + secrets).
   */
  private async ensureHotelsAmadeusBookingEnabled(): Promise<void> {
    const row = await this.providerConfigService
      .getHotelsAmadeus()
      .catch(() => null);
    if (!row) return;
    const cfg = row.config as unknown as Record<string, unknown>;
    if (cfg.bookingEnabled === true) return;
    await this.providerConfigService.setHotelsAmadeusConfig({
      ...row.config,
      bookingEnabled: true,
    });
    this.logger.log('Enabled hotels.amadeus booking (bookingEnabled → true).');
  }

  private async ensureFlightsDuffelBookingEnabled(): Promise<void> {
    const row = await this.providerConfigService
      .getFlightsDuffel()
      .catch(() => null);
    if (!row) return;
    const cfg = row.config as unknown as Record<string, unknown>;
    if (cfg.bookingEnabled === true) return;
    try {
      await this.providerConfigService.setFlightsDuffelConfig({
        ...row.config,
        bookingEnabled: true,
      });
      this.logger.log(
        'Enabled flights.duffel booking (bookingEnabled → true).',
      );
    } catch (err) {
      this.logger.warn(
        `Could not enable flights.duffel booking: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Ensure Travelport flight booking stays enabled (bookingEnabled → true).
   */
  private async ensureFlightsTravelportBookingEnabled(): Promise<void> {
    const row = await this.providerConfigService
      .getFlightsTravelport()
      .catch(() => null);
    if (!row) return;
    const cfg = row.config as unknown as Record<string, unknown>;
    if (cfg.bookingEnabled === true) return;
    try {
      await this.providerConfigService.setFlightsTravelportConfig({
        ...row.config,
        bookingEnabled: true,
      });
      this.logger.log(
        'Enabled flights.travelport booking (bookingEnabled → true).',
      );
    } catch (err) {
      this.logger.warn(
        `Could not enable flights.travelport booking: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Ensure Manual Hotels provider config exists and is active. Manual hotels
   * are admin-managed (no external API credentials needed).
   */
  private async ensureManualHotelsEnabled(): Promise<void> {
    await this.providerConfigService.ensureManualConfig('hotels', 'manual');
    this.logger.log('Enabled hotels.manual (manual offers active).');
  }

  /**
   * Ensure Manual Flights provider config exists and is active.
   */
  private async ensureManualFlightsEnabled(): Promise<void> {
    await this.providerConfigService.ensureManualConfig('flights', 'manual');
    this.logger.log('Enabled flights.manual (manual offers active).');
  }

  /**
   * Amadeus flight bookings shipped with `bookingEnabled: false`. Flip it to
   * true on existing rows so v1 bookings can be confirmed in the test
   * environment (same pattern as hotels).
   */
  private async ensureFlightsAmadeusBookingEnabled(): Promise<void> {
    const row = await this.providerConfigService
      .getFlightsAmadeus()
      .catch(() => null);
    if (!row) return;
    const cfg = row.config as unknown as Record<string, unknown>;
    if (cfg.bookingEnabled === true) return;
    try {
      await this.providerConfigService.setFlightsAmadeusConfig({
        ...row.config,
        bookingEnabled: true,
      });
      this.logger.log(
        'Enabled flights.amadeus booking (bookingEnabled → true).',
      );
    } catch (err) {
      this.logger.warn(
        `Could not enable flights.amadeus booking: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * RateHawk hotel bookings shipped with `bookingEnabled: false` (the admin
   * "BookingAllowed" toggle). Flip it to true on existing rows. Guarded so a
   * missing keyId/apiKey does not crash startup — it just logs and keeps the
   * current flag.
   */
  private async ensureHotelsRatehawkBookingEnabled(): Promise<void> {
    const row = await this.providerConfigService
      .getHotelsRatehawk()
      .catch(() => null);
    if (!row) return;
    const cfg = row.config as unknown as Record<string, unknown>;
    if (cfg.bookingEnabled === true) return;
    try {
      await this.providerConfigService.setHotelsRatehawkConfig({
        ...row.config,
        bookingEnabled: true,
      });
      this.logger.log(
        'Enabled hotels.ratehawk booking (bookingEnabled → true).',
      );
    } catch (err) {
      this.logger.warn(
        `Could not enable hotels.ratehawk booking: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
