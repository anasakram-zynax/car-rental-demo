import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { ProviderConfigStorePort } from '../ports/provider-config-store.port';
import type {
  FlightsProviderKey,
  HotelsProviderKey,
  ProviderConfigRecord,
  TravelportFlightsConfig,
  TravelportStaysHotelsConfig,
  DuffleFlightsConfig,
  HotelbedsHotelsConfig,
  RatehawkHotelsConfig,
  AmadeusFlightsConfig,
  AmadeusHotelsConfig,
} from '../../domain/provider-config.entity';
import { HttpClientService } from '../../../../shared/http/http-client.service';
import type { SecretsCryptoPort } from '../ports/secrets-crypto.port';
import type {
  ProviderConnectionCheck,
  ProviderConnectionTestResult,
  ConnectionTestEnvironment,
} from '../../domain/provider-connection-test.types';
import { sanitizeProviderDiagnostics, sanitizeUpstreamResponse } from './provider-test-sanitizer';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../../../notifications/application/notification.service';
import { SiteSettingStore } from '../../infrastructure/site-setting.store';

export const PROVIDER_CONFIG_STORE = Symbol('PROVIDER_CONFIG_STORE');
export const SECRETS_CRYPTO = Symbol('SECRETS_CRYPTO');

export type ModuleKey = 'flights' | 'hotels';

export interface ModuleConfigState {
  name: string;
}

export interface ModulesConfigMap {
  flights: ModuleConfigState;
  hotels: ModuleConfigState;
  /** Order of modules in the public search form / nav (first = default). */
  order: ModuleKey[];
}

const DEFAULT_MODULE_CONFIG: ModulesConfigMap = {
  flights: { name: 'Flights' },
  hotels: { name: 'Hotels' },
  order: ['flights', 'hotels'],
};

// Providers that make up each module's supplier cards (incl. managed inventory).
const MODULE_PROVIDERS: Record<ModuleKey, string[]> = {
  flights: ['travelport', 'duffel', 'amadeus', 'manual'],
  hotels: ['hotelbeds', 'ratehawk', 'amadeus', 'travelport-stays', 'manual'],
};

@Injectable()
export class ProviderConfigService {
  private readonly travelportUrls = {
    development: {
      authUrl: 'https://auth.pp.travelport.net/oauth/token',
      baseUrl: 'https://api.pp.travelport.net',
    },
    production: {
      authUrl: 'https://auth.travelport.net/oauth/token',
      baseUrl: 'https://api.travelport.net',
    },
  } as const;

  private readonly hotelbedsUrls = {
    development: 'https://api.test.hotelbeds.com',
    production: 'https://api.hotelbeds.com',
    mtls: 'https://api.mtls.hotelbeds.com',
  } as const;

  private readonly duffelUrls = {
    sandbox: 'https://api.duffel.com',
    production: 'https://api.duffel.com',
  } as const;

  private readonly logger = new Logger(ProviderConfigService.name);

  private readonly ratehawkUrls = {
    sandbox: 'https://api-sandbox.ratehawk.com',
    production: 'https://api.ratehawk.com',
  } as const;

  private readonly amadeusUrls = {
    test: {
      authUrl: 'https://test.travel.api.amadeus.com/v1/security/oauth2/token',
      baseUrl: 'https://test.travel.api.amadeus.com',
    },
    production: {
      authUrl: 'https://travel.api.amadeus.com/v1/security/oauth2/token',
      baseUrl: 'https://travel.api.amadeus.com',
    },
  } as const;

  private readonly amadeusHotelsUrls = {
    test: {
      authUrl: 'https://test.travel.api.amadeus.com/v1/security/oauth2/token',
      baseUrl: 'https://test.travel.api.amadeus.com',
    },
    production: {
      authUrl: 'https://travel.api.amadeus.com/v1/security/oauth2/token',
      baseUrl: 'https://travel.api.amadeus.com',
    },
  } as const;

  constructor(
    @Inject(PROVIDER_CONFIG_STORE) private readonly store: ProviderConfigStorePort,
    @Inject(SECRETS_CRYPTO) private readonly crypto: SecretsCryptoPort,
    private readonly httpClient: HttpClientService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
    private readonly siteSettings: SiteSettingStore,
  ) {}

  findAll() {
    return this.store.findAll();
  }

  async getModulesSummary() {
    const all = await this.store.findAll();
    const grouped: Record<string, { module: string; providers: Array<{ provider: string; enabled: boolean; updatedAt: string }> }> = {};

    for (const row of all) {
      grouped[row.module] ??= { module: row.module, providers: [] };
      grouped[row.module].providers.push({
        provider: row.provider,
        enabled: row.enabled,
        updatedAt: row.updatedAt,
      });
    }

    return Object.values(grouped);
  }

  // ── Module-level config (display name + master switch) ──────────────

  private readonly MODULE_CONFIG_KEY = 'module_config';

  async getModuleConfig(): Promise<ModulesConfigMap> {
    const stored = await this.siteSettings.get<Partial<ModulesConfigMap>>(this.MODULE_CONFIG_KEY);
    const known: ModuleKey[] = ['flights', 'hotels'];
    const storedOrder = Array.isArray(stored?.order) ? stored.order.filter((k) => known.includes(k)) : [];
    const order = [...storedOrder, ...known.filter((k) => !storedOrder.includes(k))];
    return {
      flights: { name: stored?.flights?.name?.trim() || DEFAULT_MODULE_CONFIG.flights.name },
      hotels: { name: stored?.hotels?.name?.trim() || DEFAULT_MODULE_CONFIG.hotels.name },
      order,
    };
  }

  async setModuleConfigName(module: ModuleKey, name: string): Promise<ModulesConfigMap> {
    const cfg = await this.getModuleConfig();
    const clean = name.trim();
    if (!clean) throw new BadRequestException('Module name cannot be empty.');
    cfg[module] = { name: clean.slice(0, 40) };
    await this.siteSettings.set(this.MODULE_CONFIG_KEY, cfg);
    return cfg;
  }

  async setModuleOrder(order: ModuleKey[]): Promise<ModulesConfigMap> {
    const cfg = await this.getModuleConfig();
    const known: ModuleKey[] = ['flights', 'hotels'];
    const clean = order.filter((k) => known.includes(k));
    for (const k of known) if (!clean.includes(k)) clean.push(k);
    cfg.order = clean;
    await this.siteSettings.set(this.MODULE_CONFIG_KEY, cfg);
    return cfg;
  }

  /** Master switch — enables/disables every provider row of a module at once. */
  async toggleModuleAll(module: ModuleKey, enabled: boolean): Promise<{ module: ModuleKey; enabled: boolean }> {
    const rows = await this.store.findAll();
    const targets = MODULE_PROVIDERS[module];
    for (const row of rows) {
      if (row.module === module && targets.includes(row.provider)) {
        await this.store.upsert({ ...row, enabled, updatedAt: new Date().toISOString() });
      }
    }
    return { module, enabled };
  }

  /** Public module visibility: a module is live when at least one supplier is enabled. */
  async getPublicModules() {
    const rows = await this.store.findAll();
    const cfg = await this.getModuleConfig();
    const live = (m: ModuleKey) => rows.some((r) => r.module === m && r.enabled);
    return {
      flights: { name: cfg.flights.name, enabled: live('flights') },
      hotels: { name: cfg.hotels.name, enabled: live('hotels') },
      order: cfg.order,
    };
  }

  /**
   * Ensure a manual provider config row exists with search/booking enabled.
   * Used by the seed to register manual hotels + flights in the Modules tab.
   */
  async ensureManualConfig(module: string, provider: string): Promise<void> {
    const existing = await this.store.findOne(module as any, provider as any);
    if (existing) {
      if (!existing.enabled) {
        await this.store.upsert({ ...existing, enabled: true, updatedAt: new Date().toISOString() });
      }
      return;
    }
    await this.store.upsert({
      module: module as any,
      provider: provider as any as FlightsProviderKey,
      enabled: true,
      config: { searchEnabled: true, bookingEnabled: true },
      updatedAt: new Date().toISOString(),
    });
  }

  async getFlightsTravelport(): Promise<ProviderConfigRecord<TravelportFlightsConfig>> {
    const row = await this.store.findOne('flights', 'travelport');
    if (!row) throw new NotFoundException('flights.travelport config not found');
    return row as ProviderConfigRecord<TravelportFlightsConfig>;
  }

  async getFlightsProvider(provider: FlightsProviderKey) {
    this.assertFlightsProvider(provider);
    if (provider === 'duffel') {
      const row = await this.getFlightsDuffel();
      const hydrated = this.applyDuffelEnvironment(row);
      return this.maskSecrets(hydrated);
    }
    if (provider === 'amadeus') {
      const row = await this.getFlightsAmadeus();
      const hydrated = this.applyAmadeusEnvironment(row);
      return this.maskSecrets(hydrated);
    }
    const row = await this.getFlightsTravelport();
    const hydrated = this.applyTravelportEnvironment(row);
    return this.maskSecrets(hydrated);
  }

  async setFlightsTravelportEnabled(enabled: boolean) {
    const row = await this.getFlightsTravelport();
    const result = await this.store.upsert({ ...row, enabled, updatedAt: new Date().toISOString() });
    const eventId = randomUUID();
    this.outboxWriter.writeSafe({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'flights.travelport',
      payload: { module: 'flights', provider: 'travelport', action: 'toggled', enabled },
    });
    this.notifications.notifyDirect({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'flights.travelport',
      payload: { module: 'flights', provider: 'travelport', action: 'toggled', enabled },
    }).catch(() => {});
    return result;
  }

  async setFlightsProviderEnabled(provider: FlightsProviderKey, enabled: boolean) {
    this.assertFlightsProvider(provider);
    if (provider === 'duffel') {
      return this.setFlightsDuffelEnabled(enabled);
    }
    if (provider === 'amadeus') {
      return this.setFlightsAmadeusEnabled(enabled);
    }
    if (provider === 'manual') {
      return this.setManualProviderEnabled('flights', enabled);
    }
    return this.setFlightsTravelportEnabled(enabled);
  }

  /**
   * Toggle Managed Hotels / Managed Flights (provider='manual').
   * Disabling removes manual offers from public search results; the admin
   * CRUD screens for manual inventory are unaffected.
   */
  async setManualProviderEnabled(module: 'flights' | 'hotels', enabled: boolean) {
    const row = await this.store.findOne(module, 'manual');
    if (!row) {
      // Seed may not have run yet — create the row on first toggle.
      await this.store.upsert({
        module,
        provider: 'manual' as FlightsProviderKey,
        enabled,
        config: { searchEnabled: true, bookingEnabled: true },
        updatedAt: new Date().toISOString(),
      });
    } else {
      await this.store.upsert({ ...row, enabled, updatedAt: new Date().toISOString() });
    }
    const eventId = randomUUID();
    this.outboxWriter.writeSafe({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: `${module}.manual`,
      payload: { module, provider: 'manual', action: 'toggled', enabled },
    });
    this.notifications.notifyDirect({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: `${module}.manual`,
      payload: { module, provider: 'manual', action: 'toggled', enabled },
    }).catch(() => {});
    return { module, provider: 'manual', enabled };
  }

  async setFlightsTravelportConfig(config: TravelportFlightsConfig) {
    const row = await this.getFlightsTravelport();
    const currentRaw = (row.config ?? {}) as Partial<TravelportFlightsConfig>;
    const current: Partial<TravelportFlightsConfig> = {
      ...currentRaw,
      password: currentRaw.password ? this.crypto.decrypt(currentRaw.password) : undefined,
      clientSecret: currentRaw.clientSecret
        ? this.crypto.decrypt(currentRaw.clientSecret)
        : undefined,
    };

    const merged: TravelportFlightsConfig = {
      ...current,
      ...config,
      password:
        config.password === undefined || config.password === ''
          ? current.password
          : config.password,
      clientSecret:
        config.clientSecret === undefined || config.clientSecret === ''
          ? current.clientSecret
          : config.clientSecret,
    } as TravelportFlightsConfig;

    // Paste-safe storage: trim every credential field before persisting.
    // resolveConfig trims at runtime too, but storing trimmed values keeps the
    // DB consistent (and encrypted values match what will actually be sent).
    for (const field of [
      'username',
      'password',
      'clientId',
      'clientSecret',
      'accessGroup',
      'pcc',
    ] as const) {
      const value = merged[field];
      if (typeof value === 'string') {
        (merged as unknown as Record<string, unknown>)[field] = value.trim();
      }
    }

    const hydrated = this.applyTravelportEnvironment({
      ...row,
      config: merged,
    });

    const encrypted = {
      ...hydrated.config,
      password: hydrated.config.password
        ? this.crypto.encrypt(hydrated.config.password)
        : undefined,
      clientSecret: hydrated.config.clientSecret
        ? this.crypto.encrypt(hydrated.config.clientSecret)
        : undefined,
    };

    return this.store.upsert({
      ...row,
      config: encrypted,
      updatedAt: new Date().toISOString(),
    });
  }

  async setFlightsProviderCredentials(provider: FlightsProviderKey, config: TravelportFlightsConfig | DuffleFlightsConfig | AmadeusFlightsConfig) {
    this.assertFlightsProvider(provider);
    let result;
    if (provider === 'duffel') {
      result = await this.setFlightsDuffelConfig(config as DuffleFlightsConfig);
    } else if (provider === 'amadeus') {
      result = await this.setFlightsAmadeusConfig(config as AmadeusFlightsConfig);
    } else {
      result = await this.setFlightsTravelportConfig(config as TravelportFlightsConfig);
    }

    this.outboxWriter.writeSafe({
      eventType: 'settings.provider_credentials_updated',
      aggregateType: 'ProviderConfig',
      aggregateId: `flights.${provider}`,
      payload: { module: 'flights', provider, action: 'credentials_updated' },
    });

    return result;
  }

  async seedFlightsProvider(provider: 'travelport' | 'duffel' | 'amadeus', config: any, enabled: boolean) {
    const existing = await this.store.findOne('flights', provider);
    if (existing) return existing;

    const encrypted: Record<string, unknown> = {
      ...config,
    };

    if (provider === 'travelport') {
      encrypted.password = config.password ? this.crypto.encrypt(config.password) : undefined;
      encrypted.clientSecret = config.clientSecret ? this.crypto.encrypt(config.clientSecret) : undefined;
    } else if (provider === 'amadeus') {
      encrypted.clientSecret = config.clientSecret ? this.crypto.encrypt(config.clientSecret) : undefined;
    } else {
      encrypted.accessToken = config.accessToken ? this.crypto.encrypt(config.accessToken) : '';
    }

    return this.store.upsert({
      module: 'flights',
      provider,
      enabled,
      config: encrypted,
      updatedAt: new Date().toISOString(),
    });
  }

  async getFlightsDuffel(): Promise<ProviderConfigRecord<DuffleFlightsConfig>> {
    const row = await this.store.findOne('flights', 'duffel');
    if (!row) throw new NotFoundException('flights.duffel config not found');
    return row as ProviderConfigRecord<DuffleFlightsConfig>;
  }

  async setFlightsDuffelEnabled(enabled: boolean) {
    const row = await this.getFlightsDuffel().catch(() => null);
    if (!row) {
      const result = await this.store.upsert({
        module: 'flights',
        provider: 'duffel',
        enabled,
        config: {
          environment: 'sandbox',
          baseUrl: 'https://api.duffel.com',
          accessToken: '',
          duffelVersion: 'v2',
          requestTimeoutMs: 15000,
          searchEnabled: true,
          bookingEnabled: false,
          priority: 0,
        },
        updatedAt: new Date().toISOString(),
      });
      const eventId = randomUUID();
      this.outboxWriter.writeSafe({
        idempotencyKey: eventId,
        eventType: 'settings.provider_toggled',
        aggregateType: 'ProviderConfig',
        aggregateId: 'flights.duffel',
        payload: { module: 'flights', provider: 'duffel', action: 'toggled', enabled },
      });
      this.notifications.notifyDirect({
        idempotencyKey: eventId,
        eventType: 'settings.provider_toggled',
        aggregateType: 'ProviderConfig',
        aggregateId: 'flights.duffel',
        payload: { module: 'flights', provider: 'duffel', action: 'toggled', enabled },
      }).catch(() => {});
      return result;
    }
    const result = await this.store.upsert({ ...row, enabled, updatedAt: new Date().toISOString() });
    const eventId = randomUUID();
    this.outboxWriter.writeSafe({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'flights.duffel',
      payload: { module: 'flights', provider: 'duffel', action: 'toggled', enabled },
    });
    this.notifications.notifyDirect({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'flights.duffel',
      payload: { module: 'flights', provider: 'duffel', action: 'toggled', enabled },
    }).catch(() => {});
    return result;
  }

  async setFlightsDuffelConfig(config: DuffleFlightsConfig) {
    const row = await this.getFlightsDuffel().catch(() => null);

    if (!row) {
      const encrypted: Record<string, unknown> = {
        ...config,
        searchEnabled: config.searchEnabled ?? true,
        bookingEnabled: config.bookingEnabled ?? false,
        priority: config.priority ?? 0,
        accessToken: config.accessToken ? this.crypto.encrypt(config.accessToken) : '',
      };
      return this.store.upsert({
        module: 'flights',
        provider: 'duffel',
        enabled: false,
        config: encrypted,
        updatedAt: new Date().toISOString(),
      });
    }

    const currentRaw = (row.config ?? {}) as Partial<DuffleFlightsConfig>;
    const currentAccessToken = currentRaw.accessToken ? this.crypto.decrypt(currentRaw.accessToken) : undefined;

    if (config.bookingEnabled) {
      this.validateDuffelCredentials(config, currentRaw);
    }

    const merged: DuffleFlightsConfig = {
      ...currentRaw,
      ...config,
      baseUrl: config.baseUrl ?? currentRaw.baseUrl ?? 'https://api.duffel.com',
      accessToken:
        config.accessToken === undefined || config.accessToken === ''
          ? (currentAccessToken ?? '')
          : config.accessToken,
      duffelVersion: config.duffelVersion ?? currentRaw.duffelVersion ?? 'v2',
      requestTimeoutMs: config.requestTimeoutMs ?? currentRaw.requestTimeoutMs ?? 15000,
      searchEnabled: config.searchEnabled ?? currentRaw.searchEnabled ?? true,
      bookingEnabled: config.bookingEnabled ?? currentRaw.bookingEnabled ?? false,
      priority: config.priority ?? currentRaw.priority ?? 0,
    } as DuffleFlightsConfig;

    const encrypted: Record<string, unknown> = {
      ...merged,
      accessToken: merged.accessToken ? this.crypto.encrypt(merged.accessToken) : undefined,
    };

    return this.store.upsert({
      ...(row ?? { module: 'flights', provider: 'duffel' }),
      config: encrypted,
      updatedAt: new Date().toISOString(),
    });
  }

  private validateDuffelCredentials(config: Partial<DuffleFlightsConfig>, currentRaw: Partial<DuffleFlightsConfig>) {
    const token = (config.accessToken || undefined) ?? currentRaw.accessToken;
    if (!token) {
      throw new BadRequestException(
        'Cannot enable booking for Duffle: access token is required. Save valid credentials first.',
      );
    }
  }

  async getHotelsHotelbeds(): Promise<ProviderConfigRecord<HotelbedsHotelsConfig>> {
    const row = await this.store.findOne('hotels', 'hotelbeds');
    if (!row) throw new NotFoundException('hotels.hotelbeds config not found');
    return row as ProviderConfigRecord<HotelbedsHotelsConfig>;
  }

  async getHotelsRatehawk(): Promise<ProviderConfigRecord<RatehawkHotelsConfig>> {
    const row = await this.store.findOne('hotels', 'ratehawk');
    if (!row) throw new NotFoundException('hotels.ratehawk config not found');
    return row as ProviderConfigRecord<RatehawkHotelsConfig>;
  }

  async getHotelsAmadeus(): Promise<ProviderConfigRecord<AmadeusHotelsConfig>> {
    const row = await this.store.findOne('hotels', 'amadeus');
    if (!row) throw new NotFoundException('hotels.amadeus config not found');
    return row as ProviderConfigRecord<AmadeusHotelsConfig>;
  }

  async getHotelsProvider(provider: HotelsProviderKey) {
    this.assertHotelsProvider(provider);
    if (provider === 'hotelbeds') {
      const row = await this.getHotelsHotelbeds();
      const hydrated = this.applyHotelbedsEnvironment(row);
      return this.maskSecrets(hydrated);
    }
    if (provider === 'amadeus') {
      const row = await this.getHotelsAmadeus();
      const hydrated = this.applyAmadeusHotelsEnvironment(row);
      return this.maskSecrets(hydrated);
    }
    if (provider === 'travelport-stays') {
      const row = await this.getHotelsTravelportStays();
      const hydrated = this.applyTravelportStaysEnvironment(row);
      return this.maskSecrets(hydrated);
    }
    const row = await this.getHotelsRatehawk();
    const hydrated = this.applyRatehawkEnvironment(row);
    return this.maskSecrets(hydrated);
  }

  async setHotelsHotelbedsEnabled(enabled: boolean) {
    const row = await this.getHotelsHotelbeds();
    const result = await this.store.upsert({ ...row, enabled, updatedAt: new Date().toISOString() });
    const eventId = randomUUID();
    this.outboxWriter.writeSafe({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'hotels.hotelbeds',
      payload: { module: 'hotels', provider: 'hotelbeds', action: 'toggled', enabled },
    });
    this.notifications.notifyDirect({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'hotels.hotelbeds',
      payload: { module: 'hotels', provider: 'hotelbeds', action: 'toggled', enabled },
    }).catch(() => {});
    return result;
  }

  async setHotelsProviderEnabled(provider: HotelsProviderKey, enabled: boolean) {
    this.assertHotelsProvider(provider);
    if (provider === 'ratehawk') {
      return this.setHotelsRatehawkEnabled(enabled);
    }
    if (provider === 'amadeus') {
      return this.setHotelsAmadeusEnabled(enabled);
    }
    if (provider === 'travelport-stays') {
      return this.setHotelsTravelportStaysEnabled(enabled);
    }
    if (provider === 'manual') {
      return this.setManualProviderEnabled('hotels', enabled);
    }
    return this.setHotelsHotelbedsEnabled(enabled);
  }

  async setHotelsHotelbedsConfig(config: HotelbedsHotelsConfig) {
    const row = await this.getHotelsHotelbeds();
    const currentRaw = (row.config ?? {}) as Partial<HotelbedsHotelsConfig>;
    const current: Partial<HotelbedsHotelsConfig> = {
      ...currentRaw,
      apiKey: currentRaw.apiKey ? this.crypto.decrypt(currentRaw.apiKey) : undefined,
      secret: currentRaw.secret ? this.crypto.decrypt(currentRaw.secret) : undefined,
      sslCert: currentRaw.sslCert ? this.crypto.decrypt(currentRaw.sslCert) : undefined,
      sslKey: currentRaw.sslKey ? this.crypto.decrypt(currentRaw.sslKey) : undefined,
    };

    // Validate: booking cannot be enabled if credentials are missing
    if (config.bookingEnabled) {
      this.validateHotelbedsCredentials(config, current);
    }

    const merged: HotelbedsHotelsConfig = {
      ...current,
      ...config,
      apiKey:
        config.apiKey === undefined || config.apiKey === ''
          ? current.apiKey
          : config.apiKey,
      secret:
        config.secret === undefined || config.secret === ''
          ? current.secret
          : config.secret,
      sslCert:
        config.sslCert === undefined || config.sslCert === ''
          ? current.sslCert
          : config.sslCert,
      sslKey:
        config.sslKey === undefined || config.sslKey === ''
          ? current.sslKey
          : config.sslKey,
      searchEnabled: config.searchEnabled ?? current.searchEnabled ?? true,
      bookingEnabled: config.bookingEnabled ?? current.bookingEnabled ?? true,
      priority: config.priority ?? current.priority ?? 0,
    } as HotelbedsHotelsConfig;

    const hydrated = this.applyHotelbedsEnvironment({
      ...row,
      config: merged,
    });

    const encrypted = {
      ...hydrated.config,
      apiKey: hydrated.config.apiKey
        ? this.crypto.encrypt(hydrated.config.apiKey)
        : undefined,
      secret: hydrated.config.secret
        ? this.crypto.encrypt(hydrated.config.secret)
        : undefined,
      sslCert: hydrated.config.sslCert
        ? this.crypto.encrypt(hydrated.config.sslCert)
        : undefined,
      sslKey: hydrated.config.sslKey
        ? this.crypto.encrypt(hydrated.config.sslKey)
        : undefined,
    };

    return this.store.upsert({
      ...row,
      config: encrypted,
      updatedAt: new Date().toISOString(),
    });
  }

  private validateHotelbedsCredentials(config: Partial<HotelbedsHotelsConfig>, current: Partial<HotelbedsHotelsConfig>) {
    const apiKey = config.apiKey ?? current.apiKey;
    const secret = config.secret ?? current.secret;
    if (!apiKey || !secret) {
      throw new BadRequestException(
        'Cannot enable booking for Hotelbeds: API key and secret are required. Save valid credentials first.',
      );
    }
  }

  async setHotelsProviderCredentials(provider: HotelsProviderKey, config: HotelbedsHotelsConfig | RatehawkHotelsConfig | AmadeusHotelsConfig | TravelportStaysHotelsConfig) {
    this.assertHotelsProvider(provider);
    const result = provider === 'ratehawk'
      ? await this.setHotelsRatehawkConfig(config as RatehawkHotelsConfig)
      : provider === 'amadeus'
        ? await this.setHotelsAmadeusConfig(config as AmadeusHotelsConfig)
        : provider === 'travelport-stays'
          ? await this.setHotelsTravelportStaysConfig(config as TravelportStaysHotelsConfig)
          : await this.setHotelsHotelbedsConfig(config as HotelbedsHotelsConfig);

    this.outboxWriter.writeSafe({
      eventType: 'settings.provider_credentials_updated',
      aggregateType: 'ProviderConfig',
      aggregateId: `hotels.${provider}`,
      payload: { module: 'hotels', provider, action: 'credentials_updated' },
    });

    return result;
  }

  // ── Travelport Stays (hotels) ──────────────────────────────

  async getHotelsTravelportStays(): Promise<ProviderConfigRecord<TravelportStaysHotelsConfig>> {
    const row = await this.store.findOne('hotels', 'travelport-stays');
    if (!row) throw new NotFoundException('hotels.travelport-stays config not found');
    return row as ProviderConfigRecord<TravelportStaysHotelsConfig>;
  }

  async setHotelsTravelportStaysEnabled(enabled: boolean) {
    const row = await this.getHotelsTravelportStays().catch(() => null);
    if (!row) {
      const result = await this.store.upsert({
        module: 'hotels',
        provider: 'travelport-stays',
        enabled,
        config: {
          environment: 'development',
          authUrl: this.travelportUrls.development.authUrl,
          baseUrl: this.travelportUrls.development.baseUrl,
          acceptVersion: '11',
          contentVersion: '11',
          requestTimeoutMs: 30000,
          oauthGrantType: 'password',
          oauthClientAuthMode: 'body',
          includeAccessGroupInToken: false,
          searchEnabled: true,
          bookingEnabled: false,
          priority: 0,
        },
        updatedAt: new Date().toISOString(),
      });
      const eventId = randomUUID();
      this.outboxWriter.writeSafe({
        idempotencyKey: eventId,
        eventType: 'settings.provider_toggled',
        aggregateType: 'ProviderConfig',
        aggregateId: 'hotels.travelport-stays',
        payload: { module: 'hotels', provider: 'travelport-stays', action: 'toggled', enabled },
      });
      this.notifications.notifyDirect({
        idempotencyKey: eventId,
        eventType: 'settings.provider_toggled',
        aggregateType: 'ProviderConfig',
        aggregateId: 'hotels.travelport-stays',
        payload: { module: 'hotels', provider: 'travelport-stays', action: 'toggled', enabled },
      }).catch(() => {});
      return result;
    }
    const result = await this.store.upsert({ ...row, enabled, updatedAt: new Date().toISOString() });
    const eventId = randomUUID();
    this.outboxWriter.writeSafe({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'hotels.travelport-stays',
      payload: { module: 'hotels', provider: 'travelport-stays', action: 'toggled', enabled },
    });
    this.notifications.notifyDirect({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'hotels.travelport-stays',
      payload: { module: 'hotels', provider: 'travelport-stays', action: 'toggled', enabled },
    }).catch(() => {});
    return result;
  }

  async setHotelsTravelportStaysConfig(config: TravelportStaysHotelsConfig) {
    const row = await this.getHotelsTravelportStays().catch(() => null);
    const currentRaw = (row?.config ?? {}) as Partial<TravelportStaysHotelsConfig>;
    const current: Partial<TravelportStaysHotelsConfig> = {
      ...currentRaw,
      password: currentRaw.password ? this.crypto.decrypt(currentRaw.password) : undefined,
      clientSecret: currentRaw.clientSecret ? this.crypto.decrypt(currentRaw.clientSecret) : undefined,
    };

    if (config.bookingEnabled) {
      this.validateTravelportStaysCredentials(config, current);
    }

    const merged: TravelportStaysHotelsConfig = {
      environment: config.environment ?? current.environment ?? 'development',
      acceptVersion: config.acceptVersion ?? current.acceptVersion ?? '11',
      contentVersion: config.contentVersion ?? current.contentVersion ?? '11',
      requestTimeoutMs: config.requestTimeoutMs ?? current.requestTimeoutMs ?? 30000,
      oauthGrantType: config.oauthGrantType ?? current.oauthGrantType ?? 'password',
      oauthClientAuthMode: config.oauthClientAuthMode ?? current.oauthClientAuthMode ?? 'body',
      includeAccessGroupInToken: config.includeAccessGroupInToken ?? current.includeAccessGroupInToken ?? false,
      username: config.username ?? current.username,
      password:
        config.password === undefined || config.password === ''
          ? current.password
          : config.password,
      clientId: config.clientId ?? current.clientId,
      clientSecret:
        config.clientSecret === undefined || config.clientSecret === ''
          ? current.clientSecret
          : config.clientSecret,
      accessGroup: config.accessGroup ?? current.accessGroup,
      pcc: config.pcc ?? current.pcc,
      gds: config.gds ?? current.gds ?? '1G',
      searchEnabled: config.searchEnabled ?? current.searchEnabled ?? true,
      bookingEnabled: config.bookingEnabled ?? current.bookingEnabled ?? false,
      priority: config.priority ?? current.priority ?? 0,
    } as TravelportStaysHotelsConfig;

    const hydrated = this.applyTravelportStaysEnvironment({
      ...(row ?? { module: 'hotels' as const, provider: 'travelport-stays' as const, enabled: false, updatedAt: new Date().toISOString() }),
      config: merged,
    });

    const encrypted = {
      ...hydrated.config,
      password: hydrated.config.password
        ? this.crypto.encrypt(hydrated.config.password)
        : undefined,
      clientSecret: hydrated.config.clientSecret
        ? this.crypto.encrypt(hydrated.config.clientSecret)
        : undefined,
    };

    return this.store.upsert({
      ...(row ?? { module: 'hotels' as const, provider: 'travelport-stays' as const, enabled: false }),
      config: encrypted,
      updatedAt: new Date().toISOString(),
    });
  }

  private validateTravelportStaysCredentials(config: Partial<TravelportStaysHotelsConfig>, current: Partial<TravelportStaysHotelsConfig>) {
    const username = config.username ?? current.username;
    const password = config.password ?? current.password;
    const clientId = config.clientId ?? current.clientId;
    const clientSecret = config.clientSecret ?? current.clientSecret;
    const accessGroup = config.accessGroup ?? current.accessGroup;
    const missing: string[] = [];
    if (!username) missing.push('username');
    if (!password) missing.push('password');
    if (!clientId) missing.push('clientId');
    if (!clientSecret) missing.push('clientSecret');
    if (!accessGroup) missing.push('accessGroup');
    if (missing.length) {
      throw new BadRequestException(
        `Cannot enable booking for Travelport Stays: missing ${missing.join(', ')}. Save valid credentials first.`,
      );
    }
  }

  async setHotelsRatehawkEnabled(enabled: boolean) {
    const row = await this.getHotelsRatehawk().catch(() => null);
    if (!row) {
      // First-time enable: create with defaults
      const result = await this.store.upsert({
        module: 'hotels',
        provider: 'ratehawk',
        enabled,
        config: {
          environment: 'sandbox',
          baseUrl: 'https://api-sandbox.worldota.net',
          keyId: '',
          apiKey: '',
          requestTimeoutMs: 15000,
          searchEnabled: true,
          bookingEnabled: false,
          priority: 0,
          webhookSecret: '',
        },
        updatedAt: new Date().toISOString(),
      });
      const eventId = randomUUID();
      this.outboxWriter.writeSafe({
        idempotencyKey: eventId,
        eventType: 'settings.provider_toggled',
        aggregateType: 'ProviderConfig',
        aggregateId: 'hotels.ratehawk',
        payload: { module: 'hotels', provider: 'ratehawk', action: 'toggled', enabled },
      });
      this.notifications.notifyDirect({
        idempotencyKey: eventId,
        eventType: 'settings.provider_toggled',
        aggregateType: 'ProviderConfig',
        aggregateId: 'hotels.ratehawk',
        payload: { module: 'hotels', provider: 'ratehawk', action: 'toggled', enabled },
      }).catch(() => {});
      return result;
    }
    const result = await this.store.upsert({ ...row, enabled, updatedAt: new Date().toISOString() });
    const eventId = randomUUID();
    this.outboxWriter.writeSafe({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'hotels.ratehawk',
      payload: { module: 'hotels', provider: 'ratehawk', action: 'toggled', enabled },
    });
    this.notifications.notifyDirect({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'hotels.ratehawk',
      payload: { module: 'hotels', provider: 'ratehawk', action: 'toggled', enabled },
    }).catch(() => {});
    return result;
  }

  async setHotelsRatehawkConfig(config: RatehawkHotelsConfig) {
    const row = await this.getHotelsRatehawk().catch(() => null);
    if (!row) {
      // Create new config
      const encrypted: Record<string, unknown> = {
        ...config,
        searchEnabled: config.searchEnabled ?? true,
        bookingEnabled: config.bookingEnabled ?? false,
        priority: config.priority ?? 0,
        apiKey: config.apiKey ? this.crypto.encrypt(config.apiKey) : '',
        webhookSecret: config.webhookSecret ?? '',
      };
      return this.store.upsert({
        module: 'hotels',
        provider: 'ratehawk',
        enabled: false,
        config: encrypted,
        updatedAt: new Date().toISOString(),
      });
    }

    const currentRaw = (row.config ?? {}) as Partial<RatehawkHotelsConfig>;
    const currentApiKey = currentRaw.apiKey ? this.crypto.decrypt(currentRaw.apiKey) : undefined;

    // Validate: booking cannot be enabled if credentials are missing
    if (config.bookingEnabled) {
      this.validateRatehawkCredentials(config, currentRaw);
    }

    const merged: RatehawkHotelsConfig = {
      ...currentRaw,
      ...config,
      keyId:
        config.keyId === undefined || config.keyId === ''
          ? (currentRaw.keyId ?? '')
          : config.keyId,
      baseUrl: config.baseUrl ?? currentRaw.baseUrl ?? this.ratehawkUrls.sandbox,
      apiKey:
        config.apiKey === undefined || config.apiKey === ''
          ? (currentApiKey ?? '')
          : config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs ?? currentRaw.requestTimeoutMs ?? 15000,
      searchEnabled: config.searchEnabled ?? currentRaw.searchEnabled ?? true,
      bookingEnabled: config.bookingEnabled ?? currentRaw.bookingEnabled ?? false,
      priority: config.priority ?? currentRaw.priority ?? 0,
      webhookSecret: config.webhookSecret ?? currentRaw.webhookSecret ?? '',
    } as RatehawkHotelsConfig;

    const hydrated = this.applyRatehawkEnvironment({
      ...row,
      config: merged,
    });

    const encrypted = {
      ...hydrated.config,
      apiKey: hydrated.config.apiKey ? this.crypto.encrypt(hydrated.config.apiKey) : undefined,
      webhookSecret: hydrated.config.webhookSecret ?? '',
    };

    return this.store.upsert({
      ...row,
      config: encrypted,
      updatedAt: new Date().toISOString(),
    });
  }

  async setHotelsAmadeusEnabled(enabled: boolean) {
    const row = await this.getHotelsAmadeus().catch(() => null);
    if (!row) {
      // First-time enable: create with defaults
      const result = await this.store.upsert({
        module: 'hotels',
        provider: 'amadeus',
        enabled,
        config: {
          environment: 'test',
          authUrl: this.amadeusHotelsUrls.test.authUrl,
          baseUrl: this.amadeusHotelsUrls.test.baseUrl,
          clientId: '',
          clientSecret: '',
          requestTimeoutMs: 30000,
          searchEnabled: true,
          bookingEnabled: false,
          priority: 0,
        },
        updatedAt: new Date().toISOString(),
      });
      const eventId = randomUUID();
      this.outboxWriter.writeSafe({
        idempotencyKey: eventId,
        eventType: 'settings.provider_toggled',
        aggregateType: 'ProviderConfig',
        aggregateId: 'hotels.amadeus',
        payload: { module: 'hotels', provider: 'amadeus', action: 'toggled', enabled },
      });
      this.notifications.notifyDirect({
        idempotencyKey: eventId,
        eventType: 'settings.provider_toggled',
        aggregateType: 'ProviderConfig',
        aggregateId: 'hotels.amadeus',
        payload: { module: 'hotels', provider: 'amadeus', action: 'toggled', enabled },
      }).catch(() => {});
      return result;
    }
    const result = await this.store.upsert({ ...row, enabled, updatedAt: new Date().toISOString() });
    const eventId = randomUUID();
    this.outboxWriter.writeSafe({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'hotels.amadeus',
      payload: { module: 'hotels', provider: 'amadeus', action: 'toggled', enabled },
    });
    this.notifications.notifyDirect({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'hotels.amadeus',
      payload: { module: 'hotels', provider: 'amadeus', action: 'toggled', enabled },
    }).catch(() => {});
    return result;
  }

  async setHotelsAmadeusConfig(config: AmadeusHotelsConfig) {
    const row = await this.getHotelsAmadeus().catch(() => null);
    if (!row) {
      // Create new config
      const encrypted: Record<string, unknown> = {
        ...config,
        searchEnabled: config.searchEnabled ?? true,
        bookingEnabled: config.bookingEnabled ?? false,
        priority: config.priority ?? 0,
        clientId: config.clientId ?? '',
        clientSecret: config.clientSecret ? this.crypto.encrypt(config.clientSecret) : '',
      };
      return this.store.upsert({
        module: 'hotels',
        provider: 'amadeus',
        enabled: false,
        config: encrypted,
        updatedAt: new Date().toISOString(),
      });
    }

    const currentRaw = (row.config ?? {}) as Partial<AmadeusHotelsConfig>;
    const currentClientSecret = currentRaw.clientSecret ? this.crypto.decrypt(currentRaw.clientSecret) : undefined;

    const merged: AmadeusHotelsConfig = {
      ...currentRaw,
      ...config,
      clientId: config.clientId ?? currentRaw.clientId ?? '',
      clientSecret:
        config.clientSecret === undefined || config.clientSecret === ''
          ? (currentClientSecret ?? '')
          : config.clientSecret,
      requestTimeoutMs: config.requestTimeoutMs ?? currentRaw.requestTimeoutMs ?? 30000,
      searchEnabled: config.searchEnabled ?? currentRaw.searchEnabled ?? true,
      bookingEnabled: config.bookingEnabled ?? currentRaw.bookingEnabled ?? false,
      priority: config.priority ?? currentRaw.priority ?? 0,
    } as AmadeusHotelsConfig;

    const hydrated = this.applyAmadeusHotelsEnvironment({
      ...row,
      config: merged,
    });

    const encrypted = {
      ...hydrated.config,
      clientSecret: hydrated.config.clientSecret ? this.crypto.encrypt(hydrated.config.clientSecret) : undefined,
    };

    return this.store.upsert({
      ...row,
      config: encrypted,
      updatedAt: new Date().toISOString(),
    });
  }

  async seedHotelsProvider(provider: 'hotelbeds' | 'ratehawk' | 'amadeus' | 'travelport-stays', config: any, enabled: boolean) {
    const existing = await this.store.findOne('hotels', provider);
    if (existing) return existing;

    const encrypted: Record<string, unknown> = {
      ...config,
    };

    if (provider === 'hotelbeds') {
      encrypted.apiKey = config.apiKey ? this.crypto.encrypt(config.apiKey) : undefined;
      encrypted.secret = config.secret ? this.crypto.encrypt(config.secret) : undefined;
      encrypted.sslCert = config.sslCert ? this.crypto.encrypt(config.sslCert) : undefined;
      encrypted.sslKey = config.sslKey ? this.crypto.encrypt(config.sslKey) : undefined;
    } else if (provider === 'amadeus') {
      encrypted.clientSecret = config.clientSecret ? this.crypto.encrypt(config.clientSecret) : undefined;
    } else if (provider === 'travelport-stays') {
      encrypted.password = config.password ? this.crypto.encrypt(config.password) : undefined;
      encrypted.clientSecret = config.clientSecret ? this.crypto.encrypt(config.clientSecret) : undefined;
    } else {
      encrypted.apiKey = config.apiKey ? this.crypto.encrypt(config.apiKey) : undefined;
    }

    return this.store.upsert({
      module: 'hotels',
      provider,
      enabled,
      config: encrypted,
      updatedAt: new Date().toISOString(),
    });
  }

  async getHotelsProviderRuntime(provider: HotelsProviderKey) {
    this.assertHotelsProvider(provider);
    const row = await this.store.findOne('hotels', provider);
    if (!row) throw new NotFoundException(`hotels.${provider} config not found`);

    const c: any = row.config ?? {};

    if (provider === 'hotelbeds') {
      const hydrated = this.applyHotelbedsEnvironment({
        ...row,
        config: {
          ...c,
          apiKey: c.apiKey ? this.crypto.decrypt(c.apiKey) : undefined,
          secret: c.secret ? this.crypto.decrypt(c.secret) : undefined,
          sslCert: c.sslCert ? this.crypto.decrypt(c.sslCert) : undefined,
          sslKey: c.sslKey ? this.crypto.decrypt(c.sslKey) : undefined,
        },
      });
      return hydrated;
    }

    if (provider === 'amadeus') {
      const hydrated = this.applyAmadeusHotelsEnvironment({
        ...row,
        config: {
          ...c,
          clientSecret: c.clientSecret ? this.crypto.decrypt(c.clientSecret) : undefined,
        },
      });
      return hydrated;
    }

    if (provider === 'travelport-stays') {
      const hydrated = this.applyTravelportStaysEnvironment({
        ...row,
        config: {
          ...c,
          password: c.password ? this.crypto.decrypt(c.password) : undefined,
          clientSecret: c.clientSecret ? this.crypto.decrypt(c.clientSecret) : undefined,
        },
      });
      return hydrated;
    }

    const hydrated = this.applyRatehawkEnvironment({
      ...row,
      config: {
        ...c,
        apiKey: c.apiKey ? this.crypto.decrypt(c.apiKey) : undefined,
        keyId: c.keyId ?? undefined,
      },
    });
    return hydrated;
  }

  async testHotelsProviderConnection(provider: HotelsProviderKey) {
    this.assertHotelsProvider(provider);
    const requestId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (provider === 'ratehawk') {
      this.logger.log(`[${requestId}] Starting RateHawk connection test...`);
      let result = await this.testRatehawkConnection(requestId);
      // Sanitize the full result before returning
      if (result) {
        result = sanitizeProviderDiagnostics(result as any);
      }
      this.logger.log(`[${requestId}] RateHawk test completed: ${(result as any)?.success ? 'success' : 'failed'}`);
      return result;
    }

    if (provider === 'amadeus') {
      this.logger.log(`[${requestId}] Starting Amadeus Hotels connection test...`);
      let result = await this.testAmadeusHotelsConnectionInternal(requestId);
      if (result) {
        result = sanitizeProviderDiagnostics(result as any);
      }
      this.logger.log(`[${requestId}] Amadeus Hotels test completed: ${(result as any)?.success ? 'success' : 'failed'}`);
      return result;
    }

    if (provider === 'travelport-stays') {
      this.logger.log(`[${requestId}] Starting Travelport Stays connection test...`);
      let result = await this.testTravelportStaysConnectionInternal(requestId);
      if (result) {
        result = sanitizeProviderDiagnostics(result as any);
      }
      this.logger.log(`[${requestId}] Travelport Stays test completed: ${(result as any)?.success ? 'success' : 'failed'}`);
      return result;
    }

    this.logger.log(`[${requestId}] Starting Hotelbeds connection test...`);
    let result = await this.testHotelbedsConnectionInternal(requestId);
    // Sanitize the full result before returning
    if (result) {
      result = sanitizeProviderDiagnostics(result as any);
    }
    this.logger.log(`[${requestId}] Hotelbeds test completed: ${(result as any)?.success ? 'success' : 'failed'}`);
    return result;
  }

  /**
   * Internal: test Travelport Stays connection — authenticates via OAuth
   * password grant, then runs a tiny properties search to prove live access.
   */
  private async testTravelportStaysConnectionInternal(
    requestId?: string,
  ): Promise<any> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let environment: ConnectionTestEnvironment = 'unknown';
    const checks: ProviderConnectionCheck[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    this.logger.log(`[${requestId ?? 'unknown'}] Travelport Stays: loading config...`);

    try {
      const row = await this.getHotelsProviderRuntime('travelport-stays');
      const c: any = { ...row.config };
      environment = (c.environment as ConnectionTestEnvironment) ?? 'development';

      const missing: string[] = [];
      if (!c.authUrl) missing.push('authUrl');
      if (!c.username) missing.push('username');
      if (!c.password) missing.push('password');
      if (!c.clientId) missing.push('clientId');
      if (!c.clientSecret) missing.push('clientSecret');
      if (!c.accessGroup) missing.push('accessGroup');

      if (missing.length > 0) {
        checks.push({
          id: 'config',
          label: 'Configuration',
          status: 'failed',
          message: `Missing required fields: ${missing.join(', ')}`,
          durationMs: Date.now() - startTime,
        });
        return this.buildTestResult('travelport-stays', 'hotels', environment, checks, warnings, startedAt, startTime);
      }

      checks.push({
        id: 'config',
        label: 'Configuration',
        status: 'success',
        message: 'All required fields present.',
        endpoint: c.baseUrl,
        durationMs: Date.now() - startTime,
      });

      // Check 2: OAuth token
      const authStart = Date.now();
      const form = new URLSearchParams({
        grant_type: c.oauthGrantType ?? 'password',
        username: c.username,
        password: c.password,
      });
      const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
      if (c.oauthClientAuthMode === 'basic') {
        headers.Authorization = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`;
      } else {
        form.set('client_id', c.clientId);
        form.set('client_secret', c.clientSecret);
      }
      if (c.includeAccessGroupInToken && c.accessGroup) form.set('access_group', c.accessGroup);

      const tokenRes = await this.httpClient.request(c.authUrl, {
        method: 'POST',
        headers,
        body: form.toString(),
        responseType: 'json',
        timeoutMs: c.requestTimeoutMs ?? 30000,
      });
      const tokenData = (tokenRes.data ?? {}) as Record<string, unknown>;
      if (!tokenRes.ok || !tokenData.access_token) {
        checks.push({
          id: 'auth',
          label: 'Authentication',
          status: 'failed',
          message: tokenRes.ok ? 'No access_token returned.' : `Token request failed (${tokenRes.status}).`,
          durationMs: Date.now() - authStart,
        });
        return this.buildTestResult('travelport-stays', 'hotels', environment, checks, warnings, startedAt, startTime);
      }

      checks.push({
        id: 'auth',
        label: 'Authentication',
        status: 'success',
        message: 'OAuth token obtained.',
        durationMs: Date.now() - authStart,
      });

      // Check 3: Live properties search (small)
      const searchStart = Date.now();
      const versionPath = c.acceptVersion ?? '11';
      const searchRes = await this.httpClient.request(`${c.baseUrl}/${versionPath}/hotel/search/properties/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Accept-Version': c.acceptVersion ?? '11',
          'Content-Version': c.contentVersion ?? '11',
          Accept: 'application/json',
          'Content-Type': 'application/json',
          XAUTH_TRAVELPORT_ACCESSGROUP: c.accessGroup,
        },
        body: JSON.stringify({
          PropertiesQuerySearch: {
            CheckInDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
            CheckOutDate: new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10),
            RoomStayCandidate: [{ '@type': 'RoomStayCandidate', GuestCounts: { '@type': 'GuestCounts', GuestCount: [{ '@type': 'GuestCount', count: 1, ageQualifyingCode: '10' }] } }],
            SearchBy: { '@type': 'SearchByCity', SearchRadius: { value: 25, unitOfDistance: 'Miles' }, SearchCity: 'DEL' },
          },
        }),
        responseType: 'json',
        timeoutMs: c.requestTimeoutMs ?? 30000,
      });

      if (!searchRes.ok) {
        checks.push({
          id: 'search',
          label: 'Properties search',
          status: 'failed',
          message: `Search request failed (${searchRes.status}).`,
          durationMs: Date.now() - searchStart,
        });
        return this.buildTestResult('travelport-stays', 'hotels', environment, checks, warnings, startedAt, startTime);
      }

      const propsCount = ((searchRes.data as any)?.PropertiesResponse?.Properties?.PropertyInfo?.length) ?? 0;
      checks.push({
        id: 'search',
        label: 'Properties search',
        status: 'success',
        message: propsCount > 0 ? `Live search returned ${propsCount} properties.` : 'Live search succeeded.',
        durationMs: Date.now() - searchStart,
      });

      return this.buildTestResult('travelport-stays', 'hotels', environment, checks, warnings, startedAt, startTime);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      checks.push({
        id: 'config',
        label: 'Configuration',
        status: 'failed',
        message: `Unexpected error: ${msg}`,
        durationMs: Date.now() - startTime,
      });
      return this.buildTestResult('travelport-stays', 'hotels', 'unknown', checks, warnings, startedAt, startTime);
    }
  }

  /**
   * Internal: test Hotelbeds connection with rich diagnostics.
   */
  private async testHotelbedsConnectionInternal(
    requestId?: string,
  ): Promise<any> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let environment: ConnectionTestEnvironment = 'unknown';
    const checks: ProviderConnectionCheck[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    this.logger.log(`[${requestId ?? 'unknown'}] Hotelbeds: loading config...`);

    // Step 1: Load runtime config
    try {
      const row = await this.getHotelsProviderRuntime('hotelbeds');
      const c: any = { ...row.config };
      environment = (c.environment as ConnectionTestEnvironment) ?? 'development';

      // Check 1: Credentials present
      const missing: string[] = [];
      if (!c.endpoint) missing.push('endpoint');
      if (!c.apiKey) missing.push('apiKey');
      if (!c.secret) missing.push('secret');

      if (missing.length > 0) {
        checks.push({
          id: 'config',
          label: 'Configuration',
          status: 'failed',
          message: `Missing required fields: ${missing.join(', ')}`,
          durationMs: Date.now() - startTime,
        });
        return this.buildTestResult('hotelbeds', 'hotels', environment, checks, warnings, startedAt, startTime);
      }

      checks.push({
        id: 'config',
        label: 'Configuration',
        status: 'success',
        message: 'All required fields present.',
        endpoint: c.endpoint,
        durationMs: Date.now() - startTime,
      });

      // Check 2: Auth header generation
      let authCheckDuration: number;
      try {
        const authStart = Date.now();
        this.buildHotelbedsHeaders(c.apiKey, c.secret);
        authCheckDuration = Date.now() - authStart;
        checks.push({
          id: 'auth',
          label: 'Authentication',
          status: 'success',
          message: 'Signature generation works.',
          durationMs: authCheckDuration,
        });
      } catch {
        checks.push({
          id: 'auth',
          label: 'Authentication',
          status: 'failed',
          message: 'Signature generation failed.',
          durationMs: Date.now() - startTime,
        });
        return this.buildTestResult('hotelbeds', 'hotels', environment, checks, warnings, startedAt, startTime);
      }

      // Check 3: API endpoint reachable
      const statusStart = Date.now();
      const res = await this.httpClient.request<any>(`${c.endpoint}/hotel-api/1.0/status`, {
        method: 'GET',
        headers: this.buildHotelbedsHeaders(c.apiKey, c.secret),
        responseType: 'json',
        timeoutMs: c.requestTimeoutMs ?? 15000,
      });

      if (!res.ok) {
        checks.push({
          id: 'status',
          label: 'Status Endpoint',
          status: 'failed',
          message: `HTTP ${res.status}: Hotelbeds status request failed.`,
          httpStatus: res.status,
          endpoint: `${c.endpoint}/hotel-api/1.0/status`,
          method: 'GET',
          durationMs: Date.now() - statusStart,
        });
        return this.buildTestResult('hotelbeds', 'hotels', environment, checks, warnings, startedAt, startTime);
      }

      checks.push({
        id: 'status',
        label: 'Status Endpoint',
        status: 'success',
        message: `HTTP ${res.status}: Status endpoint reachable.`,
        httpStatus: res.status,
        endpoint: `${c.endpoint}/hotel-api/1.0/status`,
        method: 'GET',
        durationMs: Date.now() - statusStart,
      });

      // Environment consistency warning
      checks.push({
        id: 'environment',
        label: 'Environment',
        status: 'info',
        message: `Using ${environment} environment at ${c.endpoint}`,
        endpoint: c.endpoint,
        durationMs: 0,
      });

      // mTLS warning if production
      if (environment === 'production') {
        warnings.push({
          code: 'PRODUCTION_ENVIRONMENT',
          message: 'Testing against production Hotelbeds API. Ensure credentials are correct before testing.',
        });
      }

      return this.buildTestResult('hotelbeds', 'hotels', environment, checks, warnings, startedAt, startTime);

    } catch (error: any) {
      checks.push({
        id: 'connection',
        label: 'Connection',
        status: 'failed',
        message: error?.message ?? 'Connection test failed.',
        durationMs: Date.now() - startTime,
      });
      return this.buildTestResult('hotelbeds', 'hotels', environment, checks, warnings, startedAt, startTime);
    }
  }

  private async testRatehawkConnection(
    requestId?: string,
  ): Promise<any> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let environment: ConnectionTestEnvironment = 'unknown';
    const checks: ProviderConnectionCheck[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    this.logger.log(`[${requestId ?? 'unknown'}] RateHawk: loading config...`);

    try {
      const row = await this.getHotelsProviderRuntime('ratehawk');
      const c: any = { ...row.config };
      this.logger.log(`[${requestId ?? 'unknown'}] RateHawk: config loaded (keyId=${c.keyId}, env=${c.environment})`);
      const configuredEnv = c.environment ?? 'sandbox';

      // Detect environment from base URL
      const baseUrl: string = c.baseUrl ?? '';
      if (baseUrl.includes('api-sandbox.worldota.net')) {
        environment = 'sandbox';
      } else if (baseUrl.includes('api.worldota.net')) {
        environment = 'production';
      } else {
        environment = configuredEnv;
      }

      // Check 1: Credentials present
      const missingFields: string[] = [];
      if (!c.keyId) missingFields.push('keyId');
      if (!c.apiKey) missingFields.push('apiKey');

      if (missingFields.length > 0) {
        checks.push({
          id: 'config',
          label: 'Configuration',
          status: 'failed',
          message: `Missing required fields: ${missingFields.join(', ')}`,
          durationMs: Date.now() - startTime,
        });
        return this.buildTestResult('ratehawk', 'hotels', environment, checks, warnings, startedAt, startTime);
      }

      checks.push({
        id: 'config',
        label: 'Configuration',
        status: 'success',
        message: 'All required fields present.',
        endpoint: baseUrl,
        durationMs: 0,
      });

      // Check 2: Environment detection
      const envLabel = environment === 'production' ? 'Production' : 'Sandbox';
      checks.push({
        id: 'environment',
        label: 'Environment',
        status: 'info',
        message: `Environment detected: ${envLabel}`,
        endpoint: baseUrl,
        safeDetails: {
          configuredEnv,
          detectedEnv: environment,
        },
        durationMs: 0,
      });

      // Check 3: Base URL reachable
      const urlCheckStart = Date.now();
      try {
        const headRes = await this.httpClient.request<any>(baseUrl, {
          method: 'HEAD',
          timeoutMs: c.requestTimeoutMs ?? 15000,
        });
        checks.push({
          id: 'baseUrl',
          label: 'Base URL Reachable',
          status: headRes.ok ? 'success' : 'warning',
          message: headRes.ok
            ? `Base URL reachable (HTTP ${headRes.status})`
            : `Base URL responded with HTTP ${headRes.status}`,
          endpoint: baseUrl,
          method: 'HEAD',
          httpStatus: headRes.status,
          durationMs: Date.now() - urlCheckStart,
        });
      } catch {
        checks.push({
          id: 'baseUrl',
          label: 'Base URL Reachable',
          status: 'failed',
          message: `Base URL not reachable: ${baseUrl}`,
          endpoint: baseUrl,
          durationMs: Date.now() - urlCheckStart,
        });
        return this.buildTestResult('ratehawk', 'hotels', environment, checks, warnings, startedAt, startTime);
      }

      // Check 4: Overview endpoint
      const basicAuth = Buffer.from(`${c.keyId}:${c.apiKey}`).toString('base64');
      const overviewUrl = `${baseUrl}/api/b2b/v3/overview/`;
      const overviewStart = Date.now();

      const overviewRes = await this.httpClient.request<any>(overviewUrl, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: 'application/json',
        },
        responseType: 'json',
        timeoutMs: c.requestTimeoutMs ?? 15000,
      });

      if (!overviewRes.ok) {
        const statusText = overviewRes.status === 401 ? 'Authentication failed' : `HTTP ${overviewRes.status}`;
        checks.push({
          id: 'overview',
          label: 'Overview Endpoint',
          status: 'failed',
          message: `${statusText}: RateHawk overview endpoint returned error.`,
          httpStatus: overviewRes.status,
          endpoint: overviewUrl,
          method: 'GET',
          durationMs: Date.now() - overviewStart,
        });
        return this.buildTestResult('ratehawk', 'hotels', environment, checks, warnings, startedAt, startTime);
      }

      checks.push({
        id: 'overview',
        label: 'Overview Endpoint',
        status: 'success',
        message: `HTTP ${overviewRes.status}: Overview endpoint reachable — auth accepted.`,
        httpStatus: overviewRes.status,
        endpoint: overviewUrl,
        method: 'GET',
        durationMs: Date.now() - overviewStart,
      });

      // Check 5: Parse allowed endpoints from overview
      const overviewData = overviewRes.data ?? {};
      const allowedEndpoints: string[] = [];
      if (overviewData.allowed_endpoints && Array.isArray(overviewData.allowed_endpoints)) {
        allowedEndpoints.push(...overviewData.allowed_endpoints);
      }

      if (allowedEndpoints.length > 0) {
        const hasSearch = allowedEndpoints.some((e: string) => e.includes('search') || e.includes('availability'));
        const hasBooking = allowedEndpoints.some((e: string) => e.includes('booking') || e.includes('order'));
        const hasContent = allowedEndpoints.some((e: string) => e.includes('content') || e.includes('hotel'));

        checks.push({
          id: 'endpoints',
          label: 'Allowed Endpoints',
          status: 'success',
          message: `${allowedEndpoints.length} endpoint(s) available. Search: ${hasSearch ? '✅' : '❌'}, Booking: ${hasBooking ? '✅' : '❌'}, Content: ${hasContent ? '✅' : '❌'}`,
          safeDetails: {
            endpointCount: allowedEndpoints.length,
            hasSearch,
            hasBooking,
            hasContent,
          },
          durationMs: 0,
        });

        if (!hasSearch) {
          warnings.push({ code: 'SEARCH_DISABLED', message: 'Search/availability endpoint not found in allowed endpoints for this key.' });
        }
        if (!hasBooking) {
          warnings.push({ code: 'BOOKING_DISABLED', message: 'Booking endpoint not found in allowed endpoints for this key.' });
        }
      } else {
        checks.push({
          id: 'endpoints',
          label: 'Allowed Endpoints',
          status: 'info',
          message: 'No specific endpoint list returned. All endpoints may be available.',
          durationMs: 0,
        });
      }

      // Check 6: Rate limits
      const rateLimits = overviewData.rate_limits ?? overviewData.rateLimits;
      if (rateLimits) {
        checks.push({
          id: 'rateLimits',
          label: 'Rate Limits',
          status: 'info',
          message: this.formatRateLimits(rateLimits),
          safeDetails: { rateLimits: sanitizeProviderDiagnostics(rateLimits) },
          durationMs: 0,
        });
      }

      // Check 7: Content API endpoints
      const contentEndpoints = [
        '/api/content/v1/filter_values/',
        '/api/content/v1/hotel_ids_by_filter/',
        '/api/content/v1/hotel_content_by_ids/',
      ];
      const contentCheckStart = Date.now();
      const reachableContent = await this.checkContentEndpoints(baseUrl, contentEndpoints, basicAuth, c.requestTimeoutMs ?? 15000);
      checks.push({
        id: 'contentApi',
        label: 'Content API',
        status: reachableContent.length === contentEndpoints.length ? 'success' : reachableContent.length > 0 ? 'warning' : 'failed',
        message: reachableContent.length === contentEndpoints.length
          ? 'All content endpoints reachable.'
          : `${reachableContent.length}/${contentEndpoints.length} content endpoints reachable.`,
        safeDetails: {
          reachable: reachableContent,
          configured: contentEndpoints,
        },
        durationMs: Date.now() - contentCheckStart,
      });

      if (reachableContent.length < contentEndpoints.length) {
        warnings.push({
          code: 'CONTENT_API_MISSING',
          message: `${contentEndpoints.length - reachableContent.length} content endpoint(s) unreachable. Content sync may not work.`,
        });
      }

      // Check 8: Production environment warning
      if (environment === 'production') {
        warnings.push({
          code: 'PRODUCTION_ENVIRONMENT',
          message: 'Testing against production RateHawk API. Confirm credentials before testing live data.',
        });
      }

      // Environment mismatch warning
      if (configuredEnv !== environment) {
        warnings.push({
          code: 'ENVIRONMENT_MISMATCH',
          message: `Configured environment is "${configuredEnv}" but detected "${environment}" from base URL.`,
        });
      }

      return this.buildTestResult('ratehawk', 'hotels', environment, checks, warnings, startedAt, startTime);

    } catch (error: any) {
      checks.push({
        id: 'connection',
        label: 'Connection',
        status: 'failed',
        message: error?.message ?? 'Connection test failed.',
        durationMs: Date.now() - startTime,
      });
      return this.buildTestResult('ratehawk', 'hotels', environment, checks, warnings, startedAt, startTime);
    }
  }

  /**
   * Check which content endpoints are reachable.
   */
  private async checkContentEndpoints(
    baseUrl: string,
    endpoints: string[],
    authHeader: string,
    timeoutMs: number,
  ): Promise<string[]> {
    const reachable: string[] = [];
    for (const ep of endpoints) {
      try {
        const res = await this.httpClient.request<any>(`${baseUrl}${ep}`, {
          method: 'GET',
          headers: {
            Authorization: `Basic ${authHeader}`,
            Accept: 'application/json',
          },
          responseType: 'json',
          timeoutMs: Math.min(timeoutMs, 10000),
        });
        if (res.ok) {
          reachable.push(ep);
        }
      } catch {
        // Not reachable — skip
      }
    }
    return reachable;
  }

  /**
   * Format rate limit data into a readable string.
   */
  private formatRateLimits(rateLimits: any): string {
    if (Array.isArray(rateLimits)) {
      return rateLimits
        .map((rl: any) => {
          const name = rl.name ?? rl.endpoint ?? '';
          const requests = rl.requests ?? rl.limit ?? '?';
          const seconds = rl.seconds ?? rl.window ?? '?';
          const remaining = rl.remaining ?? '?';
          return `${name}: ${requests} req / ${seconds}s (${remaining} remaining)`;
        })
        .join('; ');
    }
    if (typeof rateLimits === 'object') {
      return JSON.stringify(rateLimits);
    }
    return String(rateLimits);
  }

  /**
   * Build a standardized ProviderConnectionTestResult response.
   */
  private buildTestResult(
    provider: string,
    module: 'hotels' | 'flights',
    environment: ConnectionTestEnvironment,
    checks: ProviderConnectionCheck[],
    warnings: Array<{ code: string; message: string }>,
    startedAt: string,
    startTime: number,
  ): any {
    const durationMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();
    const hasFailed = checks.some((c) => c.status === 'failed');
    const success = !hasFailed;

    // Build summary from checks
    const passedCount = checks.filter((c) => c.status === 'success').length;
    const totalCount = checks.length;
    const summary = success
      ? `${provider} connection verified (${passedCount}/${totalCount} checks passed).`
      : `${provider} connection test completed with errors (${passedCount}/${totalCount} checks passed).`;

    // Detect account info
    const detectedAccount: Record<string, string> = {};
    if (provider === 'ratehawk') {
      detectedAccount.environmentHint = environment;
    }

    return {
      provider,
      module,
      environment,
      success,
      startedAt,
      completedAt,
      durationMs,
      summary,
      detectedAccount: Object.keys(detectedAccount).length > 0 ? detectedAccount : undefined,
      checks,
      warnings,
    };
  }

  private validateRatehawkCredentials(config: Partial<RatehawkHotelsConfig>, currentRaw: Partial<RatehawkHotelsConfig>) {
    const keyId = (config.keyId || undefined) ?? currentRaw.keyId;
    const apiKey = (config.apiKey || undefined) ?? currentRaw.apiKey;
    if (!keyId || !apiKey) {
      throw new BadRequestException(
        'Cannot enable booking for RateHawk: API key ID and API token are required. Save valid credentials first.',
      );
    }
  }

  /**
   * Internal: test Duffle connection with rich diagnostics.
   * ponytail: Tests by calling the Duffle airlines endpoint — a lightweight authenticated GET.
   * Upgrade to include offer_request verification when offering is enabled.
   */
  private async testDuffelConnectionInternal(
    requestId?: string,
  ): Promise<any> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let environment: ConnectionTestEnvironment = 'unknown';
    const checks: ProviderConnectionCheck[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    this.logger.log(`[${requestId ?? 'unknown'}] Duffle: loading config...`);

    try {
      const row = await this.getFlightsProviderRuntime('duffel');
      const c: any = { ...row.config };
      environment = c.environment === 'production' ? 'production' : 'sandbox';

      // Check 1: Credentials present
      if (!c.accessToken) {
        checks.push({
          id: 'config',
          label: 'Configuration',
          status: 'failed',
          message: 'Missing required field: accessToken',
          durationMs: Date.now() - startTime,
        });
        return this.buildTestResult('duffel', 'flights', environment, checks, warnings, startedAt, startTime);
      }

      checks.push({
        id: 'config',
        label: 'Configuration',
        status: 'success',
        message: 'Access token present.',
        endpoint: c.baseUrl,
        durationMs: 0,
      });

      // Check 2: API reachable via airlines endpoint
      const apiStart = Date.now();
      const res = await this.httpClient.request<any>(`${c.baseUrl}/air/airlines`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${c.accessToken}`,
          'Duffel-Version': c.duffelVersion ?? 'v2',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
        },
        responseType: 'json',
        timeoutMs: c.requestTimeoutMs ?? 15000,
      });

      if (!res.ok) {
        const statusText = res.status === 401
          ? 'Authentication failed (HTTP 401). Check access token.'
          : `Request failed with HTTP ${res.status}`;
        checks.push({
          id: 'api',
          label: 'API Reachable',
          status: 'failed',
          message: statusText,
          httpStatus: res.status,
          endpoint: `${c.baseUrl}/air/airlines`,
          method: 'GET',
          durationMs: Date.now() - apiStart,
        });
        return this.buildTestResult('duffel', 'flights', environment, checks, warnings, startedAt, startTime);
      }

      checks.push({
        id: 'api',
        label: 'API Reachable',
        status: 'success',
        message: `HTTP ${res.status}: Duffle API reachable — auth accepted.`,
        httpStatus: res.status,
        endpoint: `${c.baseUrl}/air/airlines`,
        method: 'GET',
        durationMs: Date.now() - apiStart,
      });

      // Check 3: Environment info
      checks.push({
        id: 'environment',
        label: 'Environment',
        status: 'info',
        message: `Using ${environment} environment at ${c.baseUrl}`,
        endpoint: c.baseUrl,
        durationMs: 0,
      });

      // Production warning
      if (environment === 'production') {
        warnings.push({
          code: 'PRODUCTION_ENVIRONMENT',
          message: 'Testing against production Duffle API. Confirm credentials before testing live data.',
        });
      }

      return this.buildTestResult('duffel', 'flights', environment, checks, warnings, startedAt, startTime);

    } catch (error: any) {
      checks.push({
        id: 'connection',
        label: 'Connection',
        status: 'failed',
        message: error?.message ?? 'Connection test failed.',
        durationMs: Date.now() - startTime,
      });
      return this.buildTestResult('duffel', 'flights', environment, checks, warnings, startedAt, startTime);
    }
  }

  private assertHotelsProvider(provider: string) {
    if (provider !== 'hotelbeds' && provider !== 'ratehawk' && provider !== 'amadeus' && provider !== 'travelport-stays' && provider !== 'manual') {
      throw new BadRequestException(`Unsupported hotels provider: ${provider}. Supported: hotelbeds, ratehawk, amadeus, travelport-stays, manual.`);
    }
  }

  private applyTravelportStaysEnvironment(row: ProviderConfigRecord<TravelportStaysHotelsConfig>) {
    const config = row.config ?? ({} as TravelportStaysHotelsConfig);
    const env = config.environment === 'production' ? 'production' : 'development';
    const urls = this.travelportUrls[env];

    return {
      ...row,
      config: {
        ...config,
        environment: env,
        authUrl: urls.authUrl,
        baseUrl: urls.baseUrl,
      },
    };
  }

  private applyRatehawkEnvironment(row: ProviderConfigRecord<RatehawkHotelsConfig>) {
    const config = row.config ?? ({} as RatehawkHotelsConfig);
    const env = config.environment === 'production' ? 'production' : 'sandbox';
    const baseUrl = this.ratehawkUrls[env];

    return {
      ...row,
      config: {
        ...config,
        environment: env,
        baseUrl,
      },
    };
  }

  private applyHotelbedsEnvironment(row: ProviderConfigRecord<HotelbedsHotelsConfig>) {
    const config = row.config ?? ({} as HotelbedsHotelsConfig);
    const env = config.environment === 'production' ? 'production' : config.environment === 'mtls' ? 'mtls' : 'development';
    const endpoint = this.hotelbedsUrls[env];

    return {
      ...row,
      config: {
        ...config,
        environment: env,
        endpoint,
      },
    };
  }

  private applyAmadeusHotelsEnvironment(row: ProviderConfigRecord<AmadeusHotelsConfig>) {
    const config = row.config ?? ({} as AmadeusHotelsConfig);
    const env = config.environment === 'production' ? 'production' : 'test';
    const urls = this.amadeusHotelsUrls[env];

    return {
      ...row,
      config: {
        ...config,
        environment: env,
        authUrl: urls.authUrl,
        baseUrl: urls.baseUrl,
      },
    };
  }

  private applyDuffelEnvironment(row: ProviderConfigRecord<DuffleFlightsConfig>) {
    const config = row.config ?? ({} as DuffleFlightsConfig);
    const env = config.environment === 'production' ? 'production' : 'sandbox';
    const baseUrl = this.duffelUrls[env];

    return {
      ...row,
      config: {
        ...config,
        environment: env,
        baseUrl,
      },
    };
  }

  private buildHotelbedsHeaders(apiKey: string, secret: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHash('sha256')
      .update(`${apiKey}${secret}${timestamp}`)
      .digest('hex');

    return {
      'Api-key': apiKey,
      'X-Signature': signature,
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
    };
  }

  async getFlightsProviderRuntime(provider: FlightsProviderKey) {
    this.assertFlightsProvider(provider);
    const row = await this.store.findOne('flights', provider);
    if (!row) throw new NotFoundException(`flights.${provider} config not found`);

    const c: any = row.config ?? {};

    if (provider === 'duffel') {
      const hydrated = this.applyDuffelEnvironment({
        ...row,
        config: {
          ...c,
          accessToken: c.accessToken ? this.crypto.decrypt(c.accessToken) : undefined,
        },
      });
      return hydrated;
    }

    if (provider === 'amadeus') {
      const hydrated = this.applyAmadeusEnvironment({
        ...row,
        config: {
          ...c,
          clientSecret: c.clientSecret ? this.crypto.decrypt(c.clientSecret) : undefined,
        },
      });
      return hydrated;
    }

    const hydrated = this.applyTravelportEnvironment({
      ...row,
      config: {
        ...c,
        password: c.password ? this.crypto.decrypt(c.password) : undefined,
        clientSecret: c.clientSecret ? this.crypto.decrypt(c.clientSecret) : undefined,
      },
    });

    return hydrated;
  }

  async testFlightsProviderConnection(provider: FlightsProviderKey) {
    this.assertFlightsProvider(provider);
    const requestId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (provider === 'duffel') {
      this.logger.log(`[${requestId}] Starting Duffle connection test...`);
      let result = await this.testDuffelConnectionInternal(requestId);
      if (result) {
        result = sanitizeProviderDiagnostics(result as any);
      }
      this.logger.log(`[${requestId}] Duffle test completed: ${(result as any)?.success ? 'success' : 'failed'}`);
      return result;
    }

    if (provider === 'amadeus') {
      this.logger.log(`[${requestId}] Starting Amadeus connection test...`);
      let result = await this.testAmadeusConnectionInternal(requestId);
      if (result) {
        result = sanitizeProviderDiagnostics(result as any);
      }
      this.logger.log(`[${requestId}] Amadeus test completed: ${(result as any)?.success ? 'success' : 'failed'}`);
      return result;
    }

    this.logger.log(`[${requestId}] Starting Travelport connection test...`);
    let result = await this.testTravelportConnectionInternal(requestId);
    // Sanitize the full result before returning
    if (result) {
      result = sanitizeProviderDiagnostics(result as any);
    }
    this.logger.log(`[${requestId}] Travelport test completed: ${(result as any)?.success ? 'success' : 'failed'}`);
    return result;
  }

  /**
   * Internal: test Travelport connection with rich diagnostics.
   */
  private async testTravelportConnectionInternal(
    requestId?: string,
  ): Promise<any> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let environment: ConnectionTestEnvironment = 'unknown';
    const checks: ProviderConnectionCheck[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    this.logger.log(`[${requestId ?? 'unknown'}] Travelport: loading config...`);

    try {
      const row = await this.getFlightsProviderRuntime('travelport');
      const c: any = { ...row.config };
      environment = (c.environment as ConnectionTestEnvironment) ?? 'development';

      // Check 1: Credentials present
      const required = ['authUrl', 'username', 'password', 'clientId', 'clientSecret'];
      const missing: string[] = required.filter((f) => !c[f]);

      if (missing.length > 0) {
        checks.push({
          id: 'config',
          label: 'Configuration',
          status: 'failed',
          message: `Missing required fields: ${missing.join(', ')}`,
          durationMs: Date.now() - startTime,
        });
        return this.buildTestResult('travelport', 'flights', environment, checks, warnings, startedAt, startTime);
      }

      checks.push({
        id: 'config',
        label: 'Configuration',
        status: 'success',
        message: 'All required fields present.',
        endpoint: c.authUrl,
        durationMs: 0,
      });

      // Check 2: Auth endpoint
      const authStart = Date.now();
      const form = new URLSearchParams();
      form.set('grant_type', c.oauthGrantType ?? 'password');
      form.set('username', c.username);
      form.set('password', c.password);

      if ((c.oauthClientAuthMode ?? 'basic') === 'body') {
        form.set('client_id', c.clientId);
        form.set('client_secret', c.clientSecret);
      }

      if (c.includeAccessGroupInToken && c.accessGroup) {
        form.set('access_group', c.accessGroup);
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      if ((c.oauthClientAuthMode ?? 'basic') === 'basic') {
        const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
        headers.Authorization = `Basic ${basic}`;
      }

      const res = await this.httpClient.request<any>(c.authUrl, {
        method: 'POST',
        headers,
        body: form.toString(),
        responseType: 'json',
        timeoutMs: c.requestTimeoutMs ?? 15000,
      });

      if (!res.ok || !res.data?.access_token) {
        checks.push({
          id: 'auth',
          label: 'OAuth Token',
          status: 'failed',
          message: res.status === 401
            ? 'Authentication failed (HTTP 401). Check credentials.'
            : `Token request failed with HTTP ${res.status}`,
          httpStatus: res.status,
          endpoint: c.authUrl,
          method: 'POST',
          durationMs: Date.now() - authStart,
        });
        return this.buildTestResult('travelport', 'flights', environment, checks, warnings, startedAt, startTime);
      }

      checks.push({
        id: 'auth',
        label: 'OAuth Token',
        status: 'success',
        message: `Token obtained. Expires in ${res.data.expires_in ?? 'unknown'}s. Type: ${res.data.token_type ?? 'Bearer'}`,
        httpStatus: res.status,
        endpoint: c.authUrl,
        method: 'POST',
        safeDetails: {
          tokenType: res.data.token_type,
          expiresIn: res.data.expires_in,
        },
        durationMs: Date.now() - authStart,
      });

      // Environment info
      checks.push({
        id: 'environment',
        label: 'Environment',
        status: 'info',
        message: `Using ${environment} environment. Auth: ${c.authUrl}`,
        endpoint: c.authUrl,
        durationMs: 0,
      });

      // Production warning
      if (environment === 'production') {
        warnings.push({
          code: 'PRODUCTION_ENVIRONMENT',
          message: 'Testing against production Travelport API. Confirm credentials before testing live data.',
        });
      }

      return this.buildTestResult('travelport', 'flights', environment, checks, warnings, startedAt, startTime);

    } catch (error: any) {
      checks.push({
        id: 'connection',
        label: 'Connection',
        status: 'failed',
        message: error?.message ?? 'Connection test failed.',
        durationMs: Date.now() - startTime,
      });
      return this.buildTestResult('travelport', 'flights', environment, checks, warnings, startedAt, startTime);
    }
  }

  private assertFlightsProvider(provider: string) {
    if (provider !== 'travelport' && provider !== 'duffel' && provider !== 'amadeus' && provider !== 'manual') {
      throw new BadRequestException(`Unsupported flights provider: ${provider}. Supported: travelport, duffel, amadeus, manual.`);
    }
  }

  async seedHotelsRatehawkProvider(config: Partial<RatehawkHotelsConfig>, enabled: boolean = false) {
    const existing = await this.store.findOne('hotels', 'ratehawk');
    if (existing) return existing;

    const encrypted: Record<string, unknown> = {
      environment: config.environment ?? 'sandbox',
      baseUrl: config.baseUrl ?? this.ratehawkUrls.sandbox,
      keyId: config.keyId ?? '',
      apiKey: config.apiKey ? this.crypto.encrypt(config.apiKey) : '',
      requestTimeoutMs: config.requestTimeoutMs ?? 15000,
      searchEnabled: config.searchEnabled ?? true,
      bookingEnabled: config.bookingEnabled ?? false,
      priority: config.priority ?? 0,
      webhookSecret: config.webhookSecret ?? '',
    };

    return this.store.upsert({
      module: 'hotels',
      provider: 'ratehawk',
      enabled,
      config: encrypted,
      updatedAt: new Date().toISOString(),
    });
  }

  private maskSecrets(row: any) {
    const maskValue = (val: string): string => {
      if (!val) return '';
      if (val.length <= 8) return '********';
      return `${'*'.repeat(8)}${val.slice(-4)}`;
    };

    const c = { ...(row.config ?? {}) };
    // Length hints (Travelport rows only, explicit owner request): the admin UI
    // renders length-matched dot placeholders for stored secrets without ever
    // receiving the real values. Only the LENGTH is exposed, never content.
    const rowMeta = row as { module?: string; provider?: string };
    const exposeLengthHints =
      rowMeta.module === 'flights' &&
      (rowMeta.provider === 'travelport' ||
        rowMeta.provider === 'travelport-stays');
    const cfg = c as Record<string, unknown>;
    const recordLength = (key: string) => {
      const v = cfg[key];
      if (exposeLengthHints && typeof v === 'string' && v) {
        cfg[`${key}Length`] = v.length;
      }
    };
    recordLength('password');
    recordLength('clientSecret');
    if (c.password) c.password = maskValue(c.password);
    if (c.clientSecret) c.clientSecret = maskValue(c.clientSecret);
    if (c.apiKey) c.apiKey = maskValue(c.apiKey);
    if (c.secret) c.secret = maskValue(c.secret);
    if (c.sslCert) c.sslCert = maskValue(c.sslCert);
    if (c.sslKey) c.sslKey = maskValue(c.sslKey);
    if (c.keyId) c.keyId = maskValue(c.keyId);
    if (c.accessToken) c.accessToken = maskValue(c.accessToken);
    if (c.webhookSecret) c.webhookSecret = maskValue(c.webhookSecret);
    if (c.searchEnabled === undefined) c.searchEnabled = true;
    if (c.bookingEnabled === undefined) c.bookingEnabled = false;
    if (c.priority === undefined) c.priority = 0;
    return { ...row, config: c };
  }

  private applyTravelportEnvironment(row: ProviderConfigRecord<TravelportFlightsConfig>) {
    const config = row.config ?? ({} as TravelportFlightsConfig);
    const env =
      config.environment === 'production' ? 'production' : 'development';
    const urls = this.travelportUrls[env];

    return {
      ...row,
      config: {
        ...config,
        environment: env,
        authUrl: urls.authUrl,
        baseUrl: urls.baseUrl,
      },
    };
  }

  // ── Amadeus Flights ──────────────────────────────────────────

  async getFlightsAmadeus(): Promise<ProviderConfigRecord<AmadeusFlightsConfig>> {
    const row = await this.store.findOne('flights', 'amadeus');
    if (!row) throw new NotFoundException('flights.amadeus config not found');
    return row as ProviderConfigRecord<AmadeusFlightsConfig>;
  }

  async setFlightsAmadeusEnabled(enabled: boolean) {
    const row = await this.getFlightsAmadeus().catch(() => null);
    if (!row) {
      const result = await this.store.upsert({
        module: 'flights',
        provider: 'amadeus',
        enabled,
        config: {
          environment: 'test',
          authUrl: this.amadeusUrls.test.authUrl,
          baseUrl: this.amadeusUrls.test.baseUrl,
          requestTimeoutMs: 30000,
          searchEnabled: true,
          bookingEnabled: false,
          ticketingEnabled: false,
          seatMapEnabled: false,
          brandedFaresEnabled: false,
          queueEnabled: false,
          priority: 0,
        },
        updatedAt: new Date().toISOString(),
      });
      const eventId = randomUUID();
      this.outboxWriter.writeSafe({
        idempotencyKey: eventId,
        eventType: 'settings.provider_toggled',
        aggregateType: 'ProviderConfig',
        aggregateId: 'flights.amadeus',
        payload: { module: 'flights', provider: 'amadeus', action: 'toggled', enabled },
      });
      this.notifications.notifyDirect({
        idempotencyKey: eventId,
        eventType: 'settings.provider_toggled',
        aggregateType: 'ProviderConfig',
        aggregateId: 'flights.amadeus',
        payload: { module: 'flights', provider: 'amadeus', action: 'toggled', enabled },
      }).catch(() => {});
      return result;
    }
    const result = await this.store.upsert({ ...row, enabled, updatedAt: new Date().toISOString() });
    const eventId = randomUUID();
    this.outboxWriter.writeSafe({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'flights.amadeus',
      payload: { module: 'flights', provider: 'amadeus', action: 'toggled', enabled },
    });
    this.notifications.notifyDirect({
      idempotencyKey: eventId,
      eventType: 'settings.provider_toggled',
      aggregateType: 'ProviderConfig',
      aggregateId: 'flights.amadeus',
      payload: { module: 'flights', provider: 'amadeus', action: 'toggled', enabled },
    }).catch(() => {});
    return result;
  }

  async setFlightsAmadeusConfig(config: AmadeusFlightsConfig) {
    const row = await this.getFlightsAmadeus().catch(() => null);

    if (!row) {
      const encrypted: Record<string, unknown> = {
        ...config,
        environment: config.environment ?? 'test',
        authUrl: config.authUrl ?? this.amadeusUrls.test.authUrl,
        baseUrl: config.baseUrl ?? this.amadeusUrls.test.baseUrl,
        requestTimeoutMs: config.requestTimeoutMs ?? 30000,
        searchEnabled: config.searchEnabled ?? true,
        bookingEnabled: config.bookingEnabled ?? false,
        ticketingEnabled: config.ticketingEnabled ?? false,
        seatMapEnabled: config.seatMapEnabled ?? false,
        brandedFaresEnabled: config.brandedFaresEnabled ?? false,
        queueEnabled: config.queueEnabled ?? false,
        priority: config.priority ?? 0,
        clientSecret: config.clientSecret ? this.crypto.encrypt(config.clientSecret) : undefined,
      };
      return this.store.upsert({
        module: 'flights',
        provider: 'amadeus',
        enabled: false,
        config: encrypted,
        updatedAt: new Date().toISOString(),
      });
    }

    const currentRaw = (row.config ?? {}) as Partial<AmadeusFlightsConfig>;
    const currentClientSecret = currentRaw.clientSecret ? this.crypto.decrypt(currentRaw.clientSecret) : undefined;

    const merged: AmadeusFlightsConfig = {
      ...currentRaw,
      ...config,
      environment: config.environment ?? currentRaw.environment ?? 'test',
      authUrl: config.authUrl ?? currentRaw.authUrl ?? this.amadeusUrls.test.authUrl,
      baseUrl: config.baseUrl ?? currentRaw.baseUrl ?? this.amadeusUrls.test.baseUrl,
      clientId:
        config.clientId === undefined || config.clientId === ''
          ? currentRaw.clientId
          : config.clientId,
      clientSecret:
        config.clientSecret === undefined || config.clientSecret === ''
          ? (currentClientSecret ?? '')
          : config.clientSecret,
      officeId: config.officeId ?? currentRaw.officeId,
      source: config.source ?? currentRaw.source,
      requestTimeoutMs: config.requestTimeoutMs ?? currentRaw.requestTimeoutMs ?? 30000,
      searchEnabled: config.searchEnabled ?? currentRaw.searchEnabled ?? true,
      bookingEnabled: config.bookingEnabled ?? currentRaw.bookingEnabled ?? false,
      ticketingEnabled: config.ticketingEnabled ?? currentRaw.ticketingEnabled ?? false,
      seatMapEnabled: config.seatMapEnabled ?? currentRaw.seatMapEnabled ?? false,
      brandedFaresEnabled: config.brandedFaresEnabled ?? currentRaw.brandedFaresEnabled ?? false,
      queueEnabled: config.queueEnabled ?? currentRaw.queueEnabled ?? false,
      priority: config.priority ?? currentRaw.priority ?? 0,
      accessCredential: config.accessCredential ?? currentRaw.accessCredential,
      lssOrgId: config.lssOrgId ?? currentRaw.lssOrgId,
      lssOfficeId: config.lssOfficeId ?? currentRaw.lssOfficeId,
      lssUserId: config.lssUserId ?? currentRaw.lssUserId,
    } as AmadeusFlightsConfig;

    const encrypted: Record<string, unknown> = {
      ...merged,
      clientSecret: merged.clientSecret ? this.crypto.encrypt(merged.clientSecret) : undefined,
    };

    return this.store.upsert({
      ...row,
      config: encrypted,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Internal: test Amadeus Hotels Enterprise connection with rich diagnostics.
   * Tests OAuth2 token acquisition + Hotel List API smoke test.
   */
  private async testAmadeusHotelsConnectionInternal(
    requestId?: string,
  ): Promise<any> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let environment: ConnectionTestEnvironment = 'unknown';
    const checks: ProviderConnectionCheck[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    this.logger.log(`[${requestId ?? 'unknown'}] Amadeus Hotels: loading config...`);

    try {
      const row = await this.getHotelsProviderRuntime('amadeus');
      const c: any = { ...row.config };
      environment = c.environment === 'production' ? 'production' : 'test';

      // Check 1: Credentials present
      const missing: string[] = [];
      if (!c.clientId) missing.push('clientId');
      if (!c.clientSecret) missing.push('clientSecret');

      if (missing.length > 0) {
        checks.push({
          id: 'config',
          label: 'Configuration',
          status: 'failed',
          message: `Missing required fields: ${missing.join(', ')}`,
          durationMs: Date.now() - startTime,
        });
        return this.buildTestResult('amadeus', 'hotels', environment, checks, warnings, startedAt, startTime);
      }

      checks.push({
        id: 'config',
        label: 'Configuration',
        status: 'success',
        message: 'All required fields present (clientId, clientSecret).',
        endpoint: c.authUrl,
        durationMs: 0,
      });

      // Check 2: OAuth token request
      const authStart = Date.now();
      const body = new URLSearchParams();
      body.set('grant_type', 'client_credentials');
      body.set('client_id', c.clientId);
      body.set('client_secret', c.clientSecret);

      const authRes = await this.httpClient.request<any>(c.authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
        responseType: 'json',
        timeoutMs: c.requestTimeoutMs ?? 30000,
      });

      const authDuration = Date.now() - authStart;

      if (!authRes.ok) {
        const statusText = authRes.status === 401
          ? 'Authentication failed (HTTP 401). Check clientId and clientSecret.'
          : `HTTP ${authRes.status}`;
        checks.push({
          id: 'auth',
          label: 'OAuth Token',
          status: 'failed',
          message: `${statusText}: ${authRes.status === 401 ? 'Invalid credentials' : 'Token endpoint returned error'}.`,
          httpStatus: authRes.status,
          endpoint: c.authUrl,
          method: 'POST',
          durationMs: authDuration,
        });
        return this.buildTestResult('amadeus', 'hotels', environment, checks, warnings, startedAt, startTime);
      }

      const tokenData = authRes.data ?? {};
      const hasToken = !!tokenData.access_token;
      const tokenType = tokenData.token_type ?? 'unknown';
      const expiresIn = tokenData.expires_in ? `${tokenData.expires_in}s` : 'unknown';

      checks.push({
        id: 'auth',
        label: 'OAuth Token',
        status: hasToken ? 'success' : 'failed',
        message: hasToken
          ? `Access token received (type: ${tokenType}, expires: ${expiresIn})`
          : 'No access_token in response',
        safeDetails: hasToken ? { tokenType, expiresIn } : undefined,
        httpStatus: authRes.status,
        endpoint: c.authUrl,
        method: 'POST',
        durationMs: authDuration,
      });

      // Check 3: Hotel List API smoke test (by-city with London)
      const smokeStart = Date.now();
      if (hasToken) {
        try {
          const smokeUrl = `${c.baseUrl}/v1/reference-data/locations/hotels/by-city?cityCode=LON&radius=5&radiusUnit=KM&hotelSource=ALL`;
          const smokeRes = await this.httpClient.request<any>(smokeUrl, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              Accept: 'application/json',
            },
            responseType: 'json',
            timeoutMs: Math.min(c.requestTimeoutMs ?? 30000, 30000),
          });

          const smokeDuration = Date.now() - smokeStart;
          if (smokeRes.ok) {
            const data = smokeRes.data ?? {};
            const hotelCount = Array.isArray(data.data) ? data.data.length : (data.meta?.count ?? '?');
            checks.push({
              id: 'api',
              label: 'Hotel List API',
              status: 'success',
              message: `HTTP ${smokeRes.status}: Hotel list search returned ${hotelCount} property/properties.`,
              httpStatus: smokeRes.status,
              endpoint: smokeUrl,
              method: 'GET',
              durationMs: smokeDuration,
            });
          } else {
            checks.push({
              id: 'api',
              label: 'Hotel List API',
              status: 'warning',
              message: `Hotel list returned HTTP ${smokeRes.status}. OAuth works but hotel API may need different credentials/scopes.`,
              httpStatus: smokeRes.status,
              endpoint: smokeUrl,
              method: 'GET',
              durationMs: smokeDuration,
            });
          }
        } catch {
          checks.push({
            id: 'api',
            label: 'Hotel List API',
            status: 'warning',
            message: `Authenticated hotel list request timed out or failed. OAuth works, API connectivity unconfirmed.`,
            endpoint: `${c.baseUrl}/v1/reference-data/locations/hotels/by-city`,
            durationMs: Date.now() - smokeStart,
          });
        }
      } else {
        checks.push({
          id: 'api',
          label: 'Hotel List API',
          status: 'skipped',
          message: 'Smoke test skipped: OAuth did not return a token.',
          durationMs: 0,
        });
      }

      // Check 4: Environment info
      const envLabel = environment === 'production' ? 'Production' : 'Test';
      checks.push({
        id: 'environment',
        label: 'Environment',
        status: 'info',
        message: `Using ${envLabel} environment at ${c.baseUrl}`,
        endpoint: c.baseUrl,
        durationMs: 0,
      });

      // Production warning
      if (environment === 'production') {
        warnings.push({
          code: 'PRODUCTION_ENVIRONMENT',
          message: 'Testing against production Amadeus Hotels API. Confirm credentials before testing live data.',
        });
      }

      return this.buildTestResult('amadeus', 'hotels', environment, checks, warnings, startedAt, startTime);

    } catch (error: any) {
      checks.push({
        id: 'connection',
        label: 'Connection',
        status: 'failed',
        message: error?.message ?? 'Connection test failed.',
        durationMs: Date.now() - startTime,
      });
      return this.buildTestResult('amadeus', 'hotels', environment, checks, warnings, startedAt, startTime);
    }
  }

  private applyAmadeusEnvironment(row: ProviderConfigRecord<AmadeusFlightsConfig>) {
    const config = row.config ?? ({} as AmadeusFlightsConfig);
    const env = config.environment === 'production' ? 'production' : 'test';
    const urls = this.amadeusUrls[env];

    return {
      ...row,
      config: {
        ...config,
        environment: env,
        authUrl: urls.authUrl,
        baseUrl: urls.baseUrl,
      },
    };
  }

  private async testAmadeusConnectionInternal(
    requestId?: string,
  ): Promise<any> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let environment: ConnectionTestEnvironment = 'unknown';
    const checks: ProviderConnectionCheck[] = [];
    const warnings: Array<{ code: string; message: string }> = [];

    this.logger.log(`[${requestId ?? 'unknown'}] Amadeus: loading config...`);

    try {
      const row = await this.getFlightsProviderRuntime('amadeus');
      const c: any = { ...row.config };
      environment = c.environment === 'production' ? 'production' : 'test';

      // Check 1: Credentials present
      const missing: string[] = [];
      if (!c.clientId) missing.push('clientId');
      if (!c.clientSecret) missing.push('clientSecret');

      if (missing.length > 0) {
        checks.push({
          id: 'config',
          label: 'Configuration',
          status: 'failed',
          message: `Missing required fields: ${missing.join(', ')}`,
          durationMs: Date.now() - startTime,
        });
        return this.buildTestResult('amadeus', 'flights', environment, checks, warnings, startedAt, startTime);
      }

      checks.push({
        id: 'config',
        label: 'Configuration',
        status: 'success',
        message: 'All required fields present (clientId, clientSecret).',
        endpoint: c.authUrl,
        durationMs: 0,
      });

      // Check 2: OAuth token request
      const authStart = Date.now();
      const body = new URLSearchParams();
      body.set('grant_type', 'client_credentials');
      body.set('client_id', c.clientId);
      body.set('client_secret', c.clientSecret);

      const authRes = await this.httpClient.request<any>(c.authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
        responseType: 'json',
        timeoutMs: c.requestTimeoutMs ?? 30000,
      });

      const authDuration = Date.now() - authStart;

      if (!authRes.ok) {
        const statusText = authRes.status === 401
          ? 'Authentication failed (HTTP 401). Check clientId and clientSecret.'
          : `HTTP ${authRes.status}`;
        checks.push({
          id: 'auth',
          label: 'OAuth Token',
          status: 'failed',
          message: `${statusText}: ${authRes.status === 401 ? 'Invalid credentials' : 'Token endpoint returned error'}.`,
          httpStatus: authRes.status,
          endpoint: c.authUrl,
          method: 'POST',
          durationMs: authDuration,
        });
        return this.buildTestResult('amadeus', 'flights', environment, checks, warnings, startedAt, startTime);
      }

      const tokenData = authRes.data ?? {};
      const hasToken = !!tokenData.access_token;
      const tokenType = tokenData.token_type ?? 'unknown';
      const expiresIn = tokenData.expires_in ? `${tokenData.expires_in}s` : 'unknown';

      checks.push({
        id: 'auth',
        label: 'OAuth Token',
        status: hasToken ? 'success' : 'failed',
        message: hasToken
          ? `Access token received (type: ${tokenType}, expires: ${expiresIn})`
          : 'No access_token in response',
        safeDetails: hasToken ? { tokenType, expiresIn } : undefined,
        httpStatus: authRes.status,
        endpoint: c.authUrl,
        method: 'POST',
        durationMs: authDuration,
      });

      // Check 3: Authenticated flight-offers smoke test
      const smokeStart = Date.now();
      if (hasToken) {
        try {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 30);
          const departDate = tomorrow.toISOString().slice(0, 10);
          const smokeUrl = `${c.baseUrl}/v2/shopping/flight-offers?originLocationCode=LHE&destinationLocationCode=DXB&departureDate=${departDate}&adults=1&max=1`;
          const smokeRes = await this.httpClient.request<any>(smokeUrl, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
              Accept: 'application/json',
            },
            responseType: 'json',
            timeoutMs: Math.min(c.requestTimeoutMs ?? 30000, 30000),
          });

          const smokeDuration = Date.now() - smokeStart;
          if (smokeRes.ok) {
            const data = smokeRes.data ?? {};
            const offerCount = Array.isArray(data.data) ? data.data.length : (data.meta?.count ?? '?');
            const src = data.meta?.source ?? '?';
            checks.push({
              id: 'api',
              label: 'Flight Search API',
              status: 'success',
              message: `HTTP ${smokeRes.status}: Flight-offers search returned ${offerCount} result(s) from ${src}.`,
              httpStatus: smokeRes.status,
              endpoint: smokeUrl,
              method: 'GET',
              durationMs: smokeDuration,
            });
          } else {
            checks.push({
              id: 'api',
              label: 'Flight Search API',
              status: 'warning',
              message: `Flight-offers returned HTTP ${smokeRes.status}. OAuth works but search API may need different credentials/scopes.`,
              httpStatus: smokeRes.status,
              endpoint: smokeUrl,
              method: 'GET',
              durationMs: smokeDuration,
            });
          }
        } catch {
          checks.push({
            id: 'api',
            label: 'Flight Search API',
            status: 'warning',
            message: `Authenticated search request timed out or failed. OAuth works, API connectivity unconfirmed.`,
            endpoint: `${c.baseUrl}/v2/shopping/flight-offers`,
            durationMs: Date.now() - smokeStart,
          });
        }
      } else {
        checks.push({
          id: 'api',
          label: 'Flight Search API',
          status: 'skipped',
          message: 'Smoke test skipped: OAuth did not return a token.',
          durationMs: 0,
        });
      }

      // Check 4: Environment info
      const envLabel = environment === 'production' ? 'Production' : 'Test';
      checks.push({
        id: 'environment',
        label: 'Environment',
        status: 'info',
        message: `Using ${envLabel} environment at ${c.baseUrl}`,
        endpoint: c.baseUrl,
        durationMs: 0,
      });

      // Production warning
      if (environment === 'production') {
        warnings.push({
          code: 'PRODUCTION_ENVIRONMENT',
          message: 'Testing against production Amadeus API. Confirm credentials before testing live data.',
        });
      }

      // Integration warning
      warnings.push({
        code: 'INTEGRATION_PENDING',
        message: 'Amadeus is admin-config only. Flight search/booking integration is not yet implemented.',
      });

      return this.buildTestResult('amadeus', 'flights', environment, checks, warnings, startedAt, startTime);

    } catch (error: any) {
      checks.push({
        id: 'connection',
        label: 'Connection',
        status: 'failed',
        message: error?.message ?? 'Connection test failed.',
        durationMs: Date.now() - startTime,
      });
      return this.buildTestResult('amadeus', 'flights', environment, checks, warnings, startedAt, startTime);
    }
  }
}
