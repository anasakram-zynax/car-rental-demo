import { Test } from '@nestjs/testing';
import { ProviderConfigService, PROVIDER_CONFIG_STORE, SECRETS_CRYPTO } from './provider-config.service';
import { HttpClientService } from '../../../../shared/http/http-client.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../../../notifications/application/notification.service';
import { SiteSettingStore } from '../../infrastructure/site-setting.store';

// Shared no-op mock: ProviderConfigService gained an OutboxWriterService dependency
// (commit 467e92f) but this spec never provided one. Tests here never assert on it.
const outboxMock = {
  write: jest.fn(async () => 'outbox-id'),
  writeOnce: jest.fn(async () => 'outbox-id'),
  writeInTransaction: jest.fn(async () => 'outbox-id'),
  writeInTransactionOnce: jest.fn(async () => 'outbox-id'),
  writeSafe: jest.fn(async () => undefined),
};
// The service only ever calls notifyDirect() on this dependency.
const notificationMock = {
  notifyDirect: jest.fn(async () => undefined),
};
// In-memory stand-in for the module-toggle store.
const siteSettingMock = {
  get: jest.fn(async () => null),
  getOrInit: jest.fn(async (_k: string, dflt: unknown) => dflt),
  set: jest.fn(async () => undefined),
};
import type { ProviderConfigStorePort } from '../ports/provider-config-store.port';
import type { SecretsCryptoPort } from '../ports/secrets-crypto.port';
import { sanitizeProviderDiagnostics } from './provider-test-sanitizer';

function makeCryptoMock(): jest.Mocked<SecretsCryptoPort> {
  return {
    encrypt: jest.fn((v: string) => `enc(${v})`),
    decrypt: jest.fn((v: string) => v.replace('enc(', '').replace(')', '')),
  };
}

function makeStoreMock(overrides?: {
  flights?: Record<string, unknown>;
  hotelbeds?: Record<string, unknown>;
  ratehawk?: Record<string, unknown>;
}): jest.Mocked<ProviderConfigStorePort> {
  const defaults = {
    flights: {
      environment: 'development',
      authUrl: 'https://auth.pp.travelport.net/oauth/token',
      baseUrl: 'https://api.pp.travelport.net',
      username: 'test-user',
      password: 'test-pass',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      acceptVersion: 'v42.0',
      contentVersion: 'v42.0',
      requestTimeoutMs: 15000,
      oauthGrantType: 'password',
      oauthClientAuthMode: 'basic',
      includeAccessGroupInToken: false,
    },
    hotelbeds: {
      environment: 'development',
      endpoint: 'https://api.test.hotelbeds.com',
      apiKey: 'test-api-key',
      secret: 'test-secret',
      requestTimeoutMs: 15000,
    },
    ratehawk: {
      environment: 'sandbox',
      baseUrl: 'https://api-sandbox.worldota.net',
      keyId: 'test-key-id',
      apiKey: 'test-api-key',
      requestTimeoutMs: 15000,
    },
  };

  const flightsCfg = overrides?.flights ?? defaults.flights;
  const hotelbedsCfg = overrides?.hotelbeds ?? defaults.hotelbeds;
  const ratehawkCfg = overrides?.ratehawk ?? defaults.ratehawk;

  return {
    findAll: jest.fn().mockResolvedValue([
      { module: 'flights', provider: 'travelport', enabled: true, config: flightsCfg, updatedAt: '2026-01-01T00:00:00Z' },
      { module: 'hotels', provider: 'hotelbeds', enabled: true, config: hotelbedsCfg, updatedAt: '2026-01-01T00:00:00Z' },
      { module: 'hotels', provider: 'ratehawk', enabled: true, config: ratehawkCfg, updatedAt: '2026-01-01T00:00:00Z' },
    ]),
    findOne: jest.fn().mockImplementation((module: string, provider: string) => {
      if (module === 'flights' && provider === 'travelport') {
        return Promise.resolve({ module, provider, enabled: true, config: flightsCfg, updatedAt: '2026-01-01T00:00:00Z' });
      }
      if (module === 'hotels' && provider === 'hotelbeds') {
        return Promise.resolve({ module, provider, enabled: true, config: hotelbedsCfg, updatedAt: '2026-01-01T00:00:00Z' });
      }
      if (module === 'hotels' && provider === 'ratehawk') {
        return Promise.resolve({ module, provider, enabled: true, config: ratehawkCfg, updatedAt: '2026-01-01T00:00:00Z' });
      }
      return Promise.resolve(null);
    }),
    upsert: jest.fn().mockImplementation((r: any) => Promise.resolve(r)),
  };
}

describe('ProviderConfigService — test connection', () => {
  let service: ProviderConfigService;
  let httpClient: jest.Mocked<HttpClientService>;
  let store: jest.Mocked<ProviderConfigStorePort>;
  let crypto: jest.Mocked<SecretsCryptoPort>;

  beforeEach(async () => {
    store = makeStoreMock() as any;
    httpClient = { request: jest.fn() } as any;
    crypto = makeCryptoMock();

    const module = await Test.createTestingModule({
      providers: [
        ProviderConfigService,
        { provide: PROVIDER_CONFIG_STORE, useValue: store },
        { provide: SECRETS_CRYPTO, useValue: crypto },
        { provide: HttpClientService, useValue: httpClient },
        { provide: OutboxWriterService, useValue: outboxMock },
        { provide: NotificationService, useValue: notificationMock },
        { provide: SiteSettingStore, useValue: siteSettingMock },
      ],
    }).compile();

    service = module.get<ProviderConfigService>(ProviderConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────
  // Sanitization helper tests
  // ──────────────────────────────────────────────

  describe('sanitization (via sanitizeProviderDiagnostics)', () => {
    it('removes secrets from test result data', () => {
      const data = {
        provider: 'ratehawk',
        module: 'hotels',
        environment: 'sandbox',
        success: true,
        summary: 'OK',
        checks: [
          {
            id: 'auth',
            label: 'Auth',
            status: 'success' as const,
            message: 'OK',
            safeDetails: {
              apiKey: 'my-secret-key-1234',
              token: 'bearer-token-here',
            },
          },
        ],
        warnings: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 100,
      };

      const sanitized = sanitizeProviderDiagnostics(data as any);
      expect(sanitized.checks[0].safeDetails.apiKey).toContain('•');
      expect(sanitized.checks[0].safeDetails.token).toContain('•');
    });
  });

  // ──────────────────────────────────────────────
  // RateHawk test connection
  // ──────────────────────────────────────────────

  describe('testHotelsProviderConnection — RateHawk', () => {
    it('returns failed checks when credentials are missing', async () => {
      store = makeStoreMock({
        ratehawk: {
          environment: 'sandbox',
          baseUrl: 'https://api-sandbox.worldota.net',
          keyId: '',
          apiKey: '',
          requestTimeoutMs: 15000,
        },
      }) as any;

      const mod = await Test.createTestingModule({
        providers: [
          ProviderConfigService,
          { provide: PROVIDER_CONFIG_STORE, useValue: store },
          { provide: SECRETS_CRYPTO, useValue: crypto },
          { provide: HttpClientService, useValue: httpClient },
        { provide: OutboxWriterService, useValue: outboxMock },
        { provide: NotificationService, useValue: notificationMock },
        { provide: SiteSettingStore, useValue: siteSettingMock },
        ],
      }).compile();
      service = mod.get<ProviderConfigService>(ProviderConfigService);

      const result = await service.testHotelsProviderConnection('ratehawk');
      expect(result.success).toBe(false);
      expect(result.checks[0].status).toBe('failed');
      expect(result.checks[0].message).toContain('Missing');
    });

    it('returns failed checks when base URL is unreachable', async () => {
      httpClient.request.mockRejectedValue(new Error('Connection refused'));

      const result = await service.testHotelsProviderConnection('ratehawk');
      expect(result.success).toBe(false);
      expect(result.checks.some((c: any) => c.status === 'failed')).toBe(true);
    });

    it('detects sandbox environment from base URL', async () => {
      httpClient.request.mockResolvedValue({
        ok: true,
        status: 200,
        data: { allowed_endpoints: ['search', 'booking', 'content'], rate_limits: [] },
      } as any);

      const result = await service.testHotelsProviderConnection('ratehawk');
      expect(result.environment).toBe('sandbox');
    });

    it('detects production environment from base URL', async () => {
      store = makeStoreMock({
        ratehawk: {
          environment: 'production',
          baseUrl: 'https://api.worldota.net',
          keyId: 'test-key-id',
          apiKey: 'test-api-key',
          requestTimeoutMs: 15000,
        },
      }) as any;

      httpClient.request.mockResolvedValue({
        ok: true,
        status: 200,
        data: { allowed_endpoints: ['search', 'booking'], rate_limits: [] },
      } as any);

      const mod = await Test.createTestingModule({
        providers: [
          ProviderConfigService,
          { provide: PROVIDER_CONFIG_STORE, useValue: store },
          { provide: SECRETS_CRYPTO, useValue: crypto },
          { provide: HttpClientService, useValue: httpClient },
        { provide: OutboxWriterService, useValue: outboxMock },
        { provide: NotificationService, useValue: notificationMock },
        { provide: SiteSettingStore, useValue: siteSettingMock },
        ],
      }).compile();
      service = mod.get<ProviderConfigService>(ProviderConfigService);

      const result = await service.testHotelsProviderConnection('ratehawk');
      expect(result.environment).toBe('production');
      expect(result.checks.some((c: any) => c.id === 'contentApi')).toBe(true);
    });

    it('succeeds when overview endpoint returns valid data', async () => {
      httpClient.request
        // 1: HEAD base URL → ok
        .mockResolvedValueOnce({ ok: true, status: 200 } as any)
        // 2: GET overview → success
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: {
            allowed_endpoints: ['/api/b2b/v3/search/', '/api/b2b/v3/booking/', '/api/content/v1/filter_values/', '/api/content/v1/hotel_ids_by_filter/', '/api/content/v1/hotel_content_by_ids/'],
            rate_limits: [{ name: 'default', requests: 30, seconds: 60, remaining: 28 }],
          },
        } as any)
        // 3-5: Content endpoint checks → all ok
        .mockResolvedValue({ ok: true, status: 200 } as any);

      const result = await service.testHotelsProviderConnection('ratehawk');
      expect(result.success).toBe(true);
      expect(result.success).toBe(true);
      expect(result.checks.some((c: any) => c.id === 'overview')).toBe(true);
      expect(result.checks.some((c: any) => c.id === 'endpoints')).toBe(true);
      expect(result.checks.some((c: any) => c.id === 'rateLimits')).toBe(true);
      expect(result.checks.some((c: any) => c.id === 'contentApi')).toBe(true);
    });

    it('fails when overview endpoint returns 401', async () => {
      httpClient.request
        .mockResolvedValueOnce({ ok: true, status: 200 } as any) // HEAD ok
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          data: null,
        } as any);

      const result = await service.testHotelsProviderConnection('ratehawk');
      expect(result.success).toBe(false);
      expect(result.checks.some((c: any) => c.id === 'overview' && c.status === 'failed')).toBe(true);
    });

    it('returns production warning when environment is production', async () => {
      store = makeStoreMock({
        ratehawk: {
          environment: 'production',
          baseUrl: 'https://api.worldota.net',
          keyId: 'test-key-id',
          apiKey: 'test-api-key',
          requestTimeoutMs: 15000,
        },
      }) as any;

      httpClient.request
        .mockResolvedValueOnce({ ok: true, status: 200 } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { allowed_endpoints: ['search', 'booking'], rate_limits: [] },
        } as any)
        .mockResolvedValue({ ok: true, status: 200 } as any);

      const mod = await Test.createTestingModule({
        providers: [
          ProviderConfigService,
          { provide: PROVIDER_CONFIG_STORE, useValue: store },
          { provide: SECRETS_CRYPTO, useValue: crypto },
          { provide: HttpClientService, useValue: httpClient },
        { provide: OutboxWriterService, useValue: outboxMock },
        { provide: NotificationService, useValue: notificationMock },
        { provide: SiteSettingStore, useValue: siteSettingMock },
        ],
      }).compile();
      service = mod.get<ProviderConfigService>(ProviderConfigService);

      const result = await service.testHotelsProviderConnection('ratehawk');
      expect(result.warnings.some((w: any) => w.code === 'PRODUCTION_ENVIRONMENT')).toBe(true);
    });

    it('parses allowed endpoints correctly', async () => {
      httpClient.request
        .mockResolvedValueOnce({ ok: true, status: 200 } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: {
            allowed_endpoints: ['/api/b2b/v3/search/', '/api/b2b/v3/booking/', '/api/content/v1/filter_values/'],
            rate_limits: [],
          },
        } as any)
        .mockResolvedValue({ ok: true, status: 200 } as any);

      const result = await service.testHotelsProviderConnection('ratehawk');
      const endpointsCheck = result.checks.find((c: any) => c.id === 'endpoints');
      expect(endpointsCheck).toBeDefined();
      expect(endpointsCheck.safeDetails.hasSearch).toBe(true);
      expect(endpointsCheck.safeDetails.hasBooking).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Hotelbeds test connection
  // ──────────────────────────────────────────────

  describe('testHotelsProviderConnection — Hotelbeds', () => {
    it('returns failed when credentials missing', async () => {
      store = makeStoreMock({
        hotelbeds: {
          environment: 'development',
          endpoint: '',
          apiKey: '',
          secret: '',
          requestTimeoutMs: 15000,
        },
      }) as any;

      const mod = await Test.createTestingModule({
        providers: [
          ProviderConfigService,
          { provide: PROVIDER_CONFIG_STORE, useValue: store },
          { provide: SECRETS_CRYPTO, useValue: crypto },
          { provide: HttpClientService, useValue: httpClient },
        { provide: OutboxWriterService, useValue: outboxMock },
        { provide: NotificationService, useValue: notificationMock },
        { provide: SiteSettingStore, useValue: siteSettingMock },
        ],
      }).compile();
      service = mod.get<ProviderConfigService>(ProviderConfigService);

      const result = await service.testHotelsProviderConnection('hotelbeds');
      expect(result.success).toBe(false);
      expect(result.checks[0].status).toBe('failed');
      expect(result.checks[0].message).toContain('Missing');
    });

    it('succeeds when status endpoint responds', async () => {
      httpClient.request.mockResolvedValue({
        ok: true,
        status: 200,
        data: { status: 'ok' },
      } as any);

      const result = await service.testHotelsProviderConnection('hotelbeds');
      expect(result.success).toBe(true);
      expect(result.success).toBe(true);
    });

    it('fails when status endpoint returns error', async () => {
      httpClient.request.mockResolvedValue({
        ok: false,
        status: 500,
        data: null,
      } as any);

      const result = await service.testHotelsProviderConnection('hotelbeds');
      expect(result.success).toBe(false);
      expect(result.checks.some((c: any) => c.id === 'status' && c.status === 'failed')).toBe(true);
    });

    it('returns production warning for production environment', async () => {
      store = makeStoreMock({
        hotelbeds: {
          environment: 'production',
          endpoint: 'https://api.hotelbeds.com',
          apiKey: 'test-api-key',
          secret: 'test-secret',
          requestTimeoutMs: 15000,
        },
      }) as any;

      // Single HTTP call: status endpoint
      httpClient.request.mockResolvedValue({
        ok: true,
        status: 200,
        data: { status: 'ok' },
      } as any);

      const mod = await Test.createTestingModule({
        providers: [
          ProviderConfigService,
          { provide: PROVIDER_CONFIG_STORE, useValue: store },
          { provide: SECRETS_CRYPTO, useValue: crypto },
          { provide: HttpClientService, useValue: httpClient },
        { provide: OutboxWriterService, useValue: outboxMock },
        { provide: NotificationService, useValue: notificationMock },
        { provide: SiteSettingStore, useValue: siteSettingMock },
        ],
      }).compile();
      service = mod.get<ProviderConfigService>(ProviderConfigService);

      const result = await service.testHotelsProviderConnection('hotelbeds');
      expect(result.warnings.some((w: any) => w.code === 'PRODUCTION_ENVIRONMENT')).toBe(true);
    });

  });

  // ──────────────────────────────────────────────
  // Travelport test connection
  // ──────────────────────────────────────────────

  describe('testFlightsProviderConnection — Travelport', () => {
    it('returns failed when missing credentials', async () => {
      store = makeStoreMock({
        flights: {
          environment: 'development',
          username: '',
          password: '',
          clientId: '',
          clientSecret: '',
          requestTimeoutMs: 15000,
        },
      }) as any;

      const mod = await Test.createTestingModule({
        providers: [
          ProviderConfigService,
          { provide: PROVIDER_CONFIG_STORE, useValue: store },
          { provide: SECRETS_CRYPTO, useValue: crypto },
          { provide: HttpClientService, useValue: httpClient },
        { provide: OutboxWriterService, useValue: outboxMock },
        { provide: NotificationService, useValue: notificationMock },
        { provide: SiteSettingStore, useValue: siteSettingMock },
        ],
      }).compile();
      service = mod.get<ProviderConfigService>(ProviderConfigService);

      const result = await service.testFlightsProviderConnection('travelport');
      expect(result.success).toBe(false);
      expect(result.checks[0].status).toBe('failed');
      expect(result.checks[0].message).toContain('Missing');
    });

    it('succeeds when OAuth token is obtained', async () => {
      httpClient.request.mockResolvedValue({
        ok: true,
        status: 200,
        data: { access_token: 'test-token-value', expires_in: 3600, token_type: 'Bearer' },
      } as any);

      const result = await service.testFlightsProviderConnection('travelport');
      expect(result.success).toBe(true);
      expect(result.checks.some((c: any) => c.id === 'auth' && c.status === 'success')).toBe(true);
    });

    it('fails when OAuth returns 401', async () => {
      httpClient.request.mockResolvedValue({
        ok: false,
        status: 401,
        data: null,
      } as any);

      const result = await service.testFlightsProviderConnection('travelport');
      expect(result.success).toBe(false);
      expect(result.checks.some((c: any) => c.id === 'auth' && c.status === 'failed')).toBe(true);
    });

    it('returns production warning for production environment', async () => {
      store = makeStoreMock({
        flights: {
          environment: 'production',
          authUrl: 'https://auth.travelport.net/oauth/token',
          baseUrl: 'https://api.travelport.net',
          username: 'test-user',
          password: 'test-pass',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          acceptVersion: 'v42.0',
          contentVersion: 'v42.0',
          requestTimeoutMs: 15000,
          oauthGrantType: 'password',
          oauthClientAuthMode: 'basic',
          includeAccessGroupInToken: false,
        },
      }) as any;

      httpClient.request.mockResolvedValue({
        ok: true,
        status: 200,
        data: { access_token: 'test-token', expires_in: 3600, token_type: 'Bearer' },
      } as any);

      const mod = await Test.createTestingModule({
        providers: [
          ProviderConfigService,
          { provide: PROVIDER_CONFIG_STORE, useValue: store },
          { provide: SECRETS_CRYPTO, useValue: crypto },
          { provide: HttpClientService, useValue: httpClient },
        { provide: OutboxWriterService, useValue: outboxMock },
        { provide: NotificationService, useValue: notificationMock },
        { provide: SiteSettingStore, useValue: siteSettingMock },
        ],
      }).compile();
      service = mod.get<ProviderConfigService>(ProviderConfigService);

      const result = await service.testFlightsProviderConnection('travelport');
      expect(result.warnings.some((w: any) => w.code === 'PRODUCTION_ENVIRONMENT')).toBe(true);
    });

  });
});
