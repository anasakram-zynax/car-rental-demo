import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { CacheService } from '../../../../shared/cache/cache.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import type { TravelportRuntimeConfig } from '../../../../shared/config/app-config.types';
import { HttpClientService } from '../../../../shared/http/http-client.service';
import { ProviderConfigService } from '../../../settings/application/services/provider-config.service';
import { sanitizeForLog } from './flight-log.util';

interface TravelportTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface WorkbenchSession {
  workbenchId: string;
  sessionId?: string;
}

export interface TravelerInput {
  givenName: string;
  surname: string;
  gender: string;
  birthDate: string;
  passengerTypeCode: string;
  phoneCountryCode: string;
  phoneNumber: string;
  email: string;
  documentNumber?: string;
  documentType?: string;
  issueCountry?: string;
  issueDate?: string;
  expiryDate?: string;
  nationality?: string;
  birthPlace?: string;
}

/**
 * Shared Travelport booking infrastructure.
 *
 * Consolidates OAuth token management, workbench session creation,
 * traveler body building, HTTP request execution, and response
 * extraction that is shared across all Travelport workflow services.
 *
 * This is the "fat client" that GDS and NDC strategy services
 * both delegate to for common operations.
 */
@Injectable()
export class TravelportBookingCoreService {
  private readonly logger = new Logger(TravelportBookingCoreService.name);

  constructor(
    private readonly configService: AppConfigService,
    private readonly httpClient: HttpClientService,
    private readonly cacheService: CacheService,
    private readonly providerConfigService: ProviderConfigService,
  ) {}

  // ── OAuth ────────────────────────────────────────────────

  /**
   * Resolve Travelport runtime config (env defaults + provider config overrides).
   */
  async resolveConfig(): Promise<TravelportRuntimeConfig> {
    const envDefaults = this.configService.travelport;
    const runtime = await this.providerConfigService.getFlightsProviderRuntime('travelport');
    return {
      ...envDefaults,
      ...(runtime.config as Partial<TravelportRuntimeConfig>),
    };
  }

  /**
   * Get a cached or fresh OAuth2 access token.
   */
  async getAccessToken(config: TravelportRuntimeConfig): Promise<TravelportTokenResponse> {
    const cacheKey = this.buildTokenCacheKey(config);
    const cached = await this.cacheService.get<TravelportTokenResponse>(cacheKey);
    if (cached?.access_token) return cached;

    const form = new URLSearchParams();
    form.set('grant_type', config.oauthGrantType);
    form.set('username', config.username ?? '');
    form.set('password', config.password ?? '');

    if (config.oauthClientAuthMode === 'body') {
      form.set('client_id', config.clientId ?? '');
      form.set('client_secret', config.clientSecret ?? '');
    }
    if (config.includeAccessGroupInToken && config.accessGroup) {
      form.set('access_group', config.accessGroup);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (config.oauthClientAuthMode === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
    }

    const response = await this.httpClient.request<TravelportTokenResponse>(config.authUrl, {
      method: 'POST',
      headers,
      body: form.toString(),
      timeoutMs: config.requestTimeoutMs,
      responseType: 'json',
    });

    const data = response.data;
    if (!response.ok || !data || typeof data === 'string' || !('access_token' in (data as object))) {
      throw new InternalServerErrorException({
        message: 'Travelport token request failed',
        upstreamStatus: response.status,
        upstreamResponse: response.data,
      });
    }

    const token = data as TravelportTokenResponse;
    const ttlSeconds = this.getTokenTtlSeconds(token.expires_in);
    if (ttlSeconds) await this.cacheService.set(cacheKey, token, ttlSeconds);
    return token;
  }

  // ── HTTP Request ─────────────────────────────────────────

  async requestAir<T = unknown>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    options?: {
      body?: unknown;
      sessionId?: string;
      includeAccessGroup?: boolean;
      softFail?: boolean;
      debugLog?: boolean;
    },
  ): Promise<T> {
    const config = await this.resolveConfig();
    const token = await this.getAccessToken(config);
    const baseUrl = `${config.baseUrl}/${config.acceptVersion}/air`;
    const url = `${baseUrl}${path}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.access_token}`,
      'Accept-Version': config.acceptVersion,
      'Content-Version': config.contentVersion,
    };

    if (options?.includeAccessGroup && config.accessGroup) {
      headers['XAUTH_TRAVELPORT_ACCESSGROUP'] = config.accessGroup;
    }
    if (config.pcc) {
      const gds = config.gds ?? '1G';
      headers['TVP-PCC-CORE'] = `${config.pcc.toUpperCase()}_${gds.toUpperCase()}`;
    }
    if (options?.sessionId) {
      headers['travelportPlusSessionIdentifier'] = options.sessionId;
    }

    const response = await this.httpClient.request(url, {
      method,
      headers,
      body: options?.body === undefined ? undefined : JSON.stringify(options.body),
      responseType: 'json',
      timeoutMs: config.requestTimeoutMs,
    });

    if (options?.debugLog) {
      const sanitized = sanitizeForLog(response.data);
      const snippet = typeof sanitized === 'object'
        ? JSON.stringify(sanitized, null, 2).slice(0, 5000)
        : String(response.data ?? '(empty)');
      this.logger.log(`[TravelportResponse] ${url}\n${snippet}`);
    }

    // Soft-fail: return error object for 4xx instead of throwing
    if (!response.ok && options?.softFail && response.status >= 400 && response.status < 500) {
      this.logger.warn(`Travelport 4xx: ${response.status} ${url}`);
      return { ok: false, upstreamStatus: response.status, upstreamResponse: response.data } as T;
    }

    if (!response.ok) {
      const snippet = typeof response.data === 'object'
        ? JSON.stringify(response.data).slice(0, 2000)
        : String(response.data ?? '').slice(0, 2000);
      this.logger.error(`Travelport failure: ${response.status} ${url} response=${snippet}`);
      throw new InternalServerErrorException(`Travelport request failed (${response.status})`);
    }

    return response.data as T;
  }

  // ── Workbench ────────────────────────────────────────────

  /**
   * Create a reservation workbench session.
   * Body: { "@type": "ReservationID" } — per official Travelport spec.
   */
  async createWorkbench(): Promise<WorkbenchSession | null> {
    try {
      const response = await this.requestAir<{
        ReservationResponse?: {
          Reservation?: { Identifier?: { value?: string } };
          SessionIdentifier?: string;
        };
      }>('POST', '/book/session/reservationworkbench', {
        body: { '@type': 'ReservationID' },
      });

      const reservation = response?.ReservationResponse?.Reservation;
      const workbenchId = reservation?.Identifier?.value;
      const sessionId = response?.ReservationResponse?.SessionIdentifier;
      if (!workbenchId) return null;
      return { workbenchId, sessionId };
    } catch (err: unknown) {
      this.logger.error(`Failed to create workbench: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  // ── Traveler Builder ─────────────────────────────────────

  /**
   * Build a Travelport traveler request body from traveler input.
   * Each traveler gets a unique ID (trav_1, trav_2, ...).
   */
  buildTravelerBody(traveler: TravelerInput, index: number): Record<string, unknown> {
    const travelerId = `trav_${index + 1}`;
    const body: Record<string, unknown> = {
      '@type': 'Traveler',
      gender: traveler.gender,
      birthDate: traveler.birthDate,
      id: travelerId,
      TravelerRef: travelerId,
      passengerTypeCode: traveler.passengerTypeCode || 'ADT',
      PersonName: {
        '@type': 'PersonNameDetail',
        Given: traveler.givenName,
        Surname: traveler.surname,
      },
      Email: [{ id: `email_${travelerId}`, value: traveler.email }],
    };

    if (traveler.phoneNumber) {
      body.Telephone = [
        {
          '@type': 'Telephone',
          countryAccessCode: traveler.phoneCountryCode || '1',
          phoneNumber: traveler.phoneNumber,
          id: `tel_${travelerId}`,
          role: 'Mobile',
        },
      ];
    }

    // Optional travel document
    if (traveler.documentNumber) {
      body.TravelDocument = [
        {
          '@type': 'TravelDocument',
          id: `doc_${travelerId}`,
          DocumentType: traveler.documentType || 'PASSPORT',
          DocumentNumber: traveler.documentNumber,
          IssuedCountryCode: traveler.issueCountry,
          IssuedDate: traveler.issueDate,
          ExpiryDate: traveler.expiryDate,
          Nationality: traveler.nationality || traveler.issueCountry,
          BirthPlace: traveler.birthPlace,
        },
      ];
    }

    return body;
  }

  // ── Post-Commit: Build from Locator ──────────────────────

  /**
   * Build a reservation workbench from an existing PNR locator.
   * Used for post-commit operations: re-shopping seats, adding ancillaries,
   * ticketing, etc.
   *
   * Endpoint: POST /book/session/reservationworkbench/buildfromlocator?Locator={PNR}
   *
   * @param locator - The PNR locator code from the committed booking
   * @returns A new workbench session, or null on failure
   */
  async buildFromLocator(locator: string): Promise<WorkbenchSession | null> {
    try {
      const response = await this.requestAir<{
        ReservationResponse?: {
          Reservation?: { Identifier?: { value?: string } };
          SessionIdentifier?: string;
        };
      }>(
        'POST',
        `/book/session/reservationworkbench/buildfromlocator?Locator=${encodeURIComponent(locator)}`,
        { body: { '@type': 'ReservationID' } },
      );

      const reservation = response?.ReservationResponse?.Reservation;
      const workbenchId = reservation?.Identifier?.value;
      const sessionId = response?.ReservationResponse?.SessionIdentifier;
      if (!workbenchId) return null;
      return { workbenchId, sessionId };
    } catch (err: unknown) {
      this.logger.error(`buildFromLocator failed for ${locator}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  // ── Post-Commit: Ticketing (FOP + Payment + Commit) ──────

  /**
   * Add a Form of Payment (Cash) to a workbench for ticketing.
   * Uses the flat FOP body per V11 spec.
   */
  async addFormOfPayment(workbenchId: string, sessionId?: string): Promise<boolean> {
    try {
      // Official V11: POST /air/payment/reservationworkbench/{id}/formofpayment
      // (both NDC and GDS collections).
      const fopBody = {
        '@type': 'FormOfPaymentCash',
        id: 'formOfPayment_1',
        FormOfPaymentRef: 'formOfPayment_1',
      };
      await this.requestAir(
        'POST',
        `/payment/reservationworkbench/${encodeURIComponent(workbenchId)}/formofpayment`,
        { body: fopBody, sessionId },
      );
      this.logger.log(`[Ticketing] FOP added to workbench ${workbenchId.slice(0, 8)}...`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Ticketing] Failed to add FOP: ${msg}`);
      return false;
    }
  }

  /**
   * Apply payment to a workbench for ticketing.
   * Uses the flat Payment body per V11 spec.
   */
  async applyPayment(workbenchId: string, sessionId?: string): Promise<boolean> {
    try {
      // Official V11: POST /air/paymentoffer/reservationworkbench/{id}/payments.
      // The minimal { '@type': 'Payment' } body previously sent here is not a
      // valid Payment — kept minimal callers working is not a concern as this
      // method has no production callers (dead code), but the shape now matches
      // the official Apply Payment request skeleton.
      const paymentBody = {
        '@type': 'Payment',
        id: 'payment_1',
      };
      await this.requestAir(
        'POST',
        `/paymentoffer/reservationworkbench/${encodeURIComponent(workbenchId)}/payments`,
        { body: paymentBody, sessionId },
      );
      this.logger.log(`[Ticketing] Payment applied to workbench ${workbenchId.slice(0, 8)}...`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Ticketing] Failed to apply payment: ${msg}`);
      return false;
    }
  }

  /**
   * Commit a workbench to finalize ticketing (or ancillary addition).
   * Body: { "@type": "ReservationQueryCommitReservation" } — per official spec.
   *
   * @returns The commit response, or null on failure
   */
  async commitWorkbench(workbenchId: string, sessionId?: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await this.requestAir<Record<string, unknown>>(
        'POST',
        `/book/reservation/reservations/${encodeURIComponent(workbenchId)}`,
        {
          body: { '@type': 'ReservationQueryCommitReservation' },
          sessionId,
        },
      );
      this.logger.log(`[Commit] Workbench ${workbenchId.slice(0, 8)}... committed`);
      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Commit] Failed to commit workbench: ${msg}`);
      return null;
    }
  }

  /**
   * Retrieve reservation details by locator.
   */
  async retrieveReservation(locator: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await this.requestAir<Record<string, unknown>>(
        'GET',
        `/book/reservation/reservations/${encodeURIComponent(locator)}`,
      );
      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[Reservation] Failed to retrieve ${locator}: ${msg}`);
      return null;
    }
  }

  // ── Response Extraction ──────────────────────────────────

  /**
   * Extract Travelport errors embedded in a 200 response body.
   * Checks common error paths.
   */
  extractResponseErrors(data: Record<string, unknown> | undefined): {
    ok: false;
    message: string;
    sourceCode?: string;
  } | null {
    if (!data) return null;

    const errorPaths = [
      ['CatalogOfferingsAncillaryListResponse', 'Result', 'Error'],
      ['Result', 'Error'],
    ];

    for (const path of errorPaths) {
      const errors = this.resolvePath(data, path);
      if (!errors) continue;

      const errorArray = Array.isArray(errors) ? errors : [errors];
      for (const err of errorArray) {
        if (err && typeof err === 'object') {
          const obj = err as Record<string, unknown>;
          const message = this.readString(obj.Message ?? obj.message);
          if (message) {
            return {
              ok: false,
              message,
              sourceCode: this.readString(obj.SourceCode ?? obj.sourceCode),
            };
          }
        }
      }
    }
    return null;
  }

  // ── Helpers ──────────────────────────────────────────────

  private buildTokenCacheKey(config: TravelportRuntimeConfig): string {
    const accessGroup = config.accessGroup ?? 'default';
    return `travelport:token:${config.clientId}:${config.username}:${accessGroup}`;
  }

  private getTokenTtlSeconds(expiresIn?: number): number | undefined {
    if (!expiresIn || !Number.isFinite(expiresIn)) return undefined;
    const ttl = Math.floor(expiresIn) - 60;
    return ttl > 0 ? ttl : undefined;
  }

  private resolvePath(obj: Record<string, unknown>, keys: string[]): unknown {
    let current: unknown = obj;
    for (const key of keys) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
