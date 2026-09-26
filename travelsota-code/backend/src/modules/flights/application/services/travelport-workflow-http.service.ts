import { BadRequestException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { CacheService } from "../../../../shared/cache/cache.service";
import { AppConfigService } from "../../../../shared/config/app-config.service";
import type { TravelportRuntimeConfig } from "../../../../shared/config/app-config.types";
import { HttpClientService } from "../../../../shared/http/http-client.service";
import { ProviderConfigService } from "../../../settings/application/services/provider-config.service";
import { BusinessError } from "../../../../shared/errors/business-error";
import type { FlightSearchDto } from "../../api/dto/flight-search.dto";

interface TravelportTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface WorkflowStepResult {
  name: string;
  ok: boolean;
  status: number;
  durationMs: number;
  response: unknown;
  headers: Record<string, string>;
  errors?: unknown[];
  setCookie?: string[];
}

@Injectable()
export class TravelportWorkflowHttpService {
  private readonly logger = new Logger(TravelportWorkflowHttpService.name);

  constructor(
    private readonly httpClient: HttpClientService,
    private readonly cacheService: CacheService,
    private readonly configService: AppConfigService,
    private readonly providerConfigService: ProviderConfigService,
  ) {}

async requestStep(
  name: string,
  url: string,
  options: {
    method: 'GET' | 'POST' | 'PUT';
    headers: Record<string, string>;
    body?: string;
    responseType: 'json';
  },
): Promise<WorkflowStepResult> {
  const startedAt = Date.now();
  const response = await this.httpClient.request(url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
    responseType: options.responseType,
  });
  const setCookie = this.extractSetCookieHeaders(response.headers);
  const headerEntries = Object.fromEntries(response.headers.entries());
  const resultErrors = this.extractResultErrors(response.data);
  const ok = response.ok && resultErrors.length === 0;
  if (setCookie.length > 0) {
    headerEntries['set-cookie'] = setCookie.join('; ');
  }

  return {
    name,
    ok,
    status: response.status,
    durationMs: Date.now() - startedAt,
    response: response.data,
    headers: headerEntries,
    errors: resultErrors.length > 0 ? resultErrors : undefined,
    setCookie: setCookie.length > 0 ? setCookie : undefined,
  };
}


extractSetCookieHeaders(headers: Headers): string[] {
  const candidate = headers.get('set-cookie');
  const fromGetSetCookie = (
    headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie?.();

  if (Array.isArray(fromGetSetCookie) && fromGetSetCookie.length > 0) {
    return fromGetSetCookie;
  }

  return candidate ? [candidate] : [];
}


applySetCookies(
  headers: Record<string, string>,
  jar: Map<string, string>,
  setCookieHeaders?: string[],
) {
  const attributeKeys = new Set([
    'path',
    'expires',
    'domain',
    'secure',
    'httponly',
    'samesite',
    'max-age',
  ]);

  if (setCookieHeaders && setCookieHeaders.length > 0) {
    for (const header of setCookieHeaders) {
      const pattern = /([^=;\s,]+)=([^;]*)/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(header)) !== null) {
        const name = match[1];
        const value = match[2];
        if (!name || attributeKeys.has(name.toLowerCase())) {
          continue;
        }
        jar.set(name, value);
      }
    }
  }

  if (jar.size > 0) {
    headers.Cookie = Array.from(jar.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

/**
 * Get a fresh price from Travelport's `/price/offers/buildfromproducts` endpoint
 * using the cached selected offer data.
 *
 * This is used during `confirm()` pre-booking price revalidation to detect
 * price changes since the user previewed/selected the offer.
 *
 * @param searchKey - The search cache key from the search response meta
 * @param offerId - The normalized offer ID for the selected offer
 * @returns Fresh price from the Travelport API
 * @throws BusinessError if the cache entry is expired or the API call fails
 */

extractResultErrors(payload: unknown): unknown[] {
  const errors: unknown[] = [];
  const queue: unknown[] = [payload];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }

    const record = current as Record<string, unknown>;
    const result = record.Result as Record<string, unknown> | undefined;
    if (result && typeof result === 'object') {
      const resultErrors = result.Error;
      if (Array.isArray(resultErrors)) {
        errors.push(...resultErrors);
      } else if (resultErrors) {
        errors.push(resultErrors);
      }
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return errors;
}


async resolveConfig(
  input: FlightSearchDto,
): Promise<TravelportRuntimeConfig> {
  const envDefaults = this.configService.travelport;
  const runtime =
    await this.providerConfigService.getFlightsProviderRuntime('travelport');
  const providerConfig = runtime.config as Partial<TravelportRuntimeConfig>;

  const baseConfig: TravelportRuntimeConfig = {
    ...envDefaults,
    ...providerConfig,
  };

  if (
    !baseConfig.username ||
    !baseConfig.password ||
    !baseConfig.clientId ||
    !baseConfig.clientSecret
  ) {
    throw new InternalServerErrorException(
      'Missing Travelport credentials. Set provider credentials from admin or env fallback.',
    );
  }

  const accessGroup = input.accessGroup ?? baseConfig.accessGroup;
  const pcc = input.pcc ?? baseConfig.pcc;

  if (!accessGroup && !pcc) {
    throw new BadRequestException(
      'Provide accessGroup/pcc in request body or configure TRAVELPORT_ACCESS_GROUP/TRAVELPORT_PCC.',
    );
  }

  return {
    ...baseConfig,
    accessGroup,
    pcc,
    gds: input.gds ?? baseConfig.gds ?? '1G',
  };
}


async getAccessToken(
  config: TravelportRuntimeConfig,
): Promise<TravelportTokenResponse> {
  const cacheKey = this.buildTokenCacheKey(config);
  const cachedToken =
    await this.cacheService.get<TravelportTokenResponse>(cacheKey);

  if (cachedToken?.access_token) {
    return cachedToken;
  }

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
    const basicValue = Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
    ).toString('base64');
    headers.Authorization = `Basic ${basicValue}`;
  }

  const tokenResponse =
    await this.httpClient.request<TravelportTokenResponse>(config.authUrl, {
      method: 'POST',
      headers,
      body: form.toString(),
      timeoutMs: config.requestTimeoutMs,
      responseType: 'json',
    });

  if (!tokenResponse.ok) {
    throw new BadRequestException({
      message: 'Travelport token request failed',
      upstreamStatus: tokenResponse.status,
      upstreamResponse: tokenResponse.data,
    });
  }

  const token = tokenResponse.data as TravelportTokenResponse;
  if (!token?.access_token) {
    throw new InternalServerErrorException(
      'Travelport token response did not include access_token.',
    );
  }

  const ttlSeconds = this.getTokenTtlSeconds(token.expires_in);
  if (ttlSeconds) {
    await this.cacheService.set(cacheKey, token, ttlSeconds);
  }

  return token;
}


buildTokenCacheKey(config: TravelportRuntimeConfig): string {
  const accessGroup = config.accessGroup ?? 'default';
  return `travelport:token:${config.clientId}:${config.username}:${accessGroup}:${this.buildCredentialFingerprint(config)}`;
}


buildCredentialFingerprint(config: TravelportRuntimeConfig): string {
  const source = `${config.clientSecret ?? ''}|${config.password ?? ''}`;
  return Buffer.from(source).toString('base64').slice(0, 16);
}


getTokenTtlSeconds(
  expiresIn: number | undefined,
): number | undefined {
  if (!Number.isFinite(expiresIn) || !expiresIn || expiresIn <= 0) {
    return undefined;
  }

  const ttlSeconds = Math.floor(expiresIn - 30);
  return ttlSeconds > 30 ? ttlSeconds : 30;
}
/**
 * Verify that requested ancillaries appear in the reservation response.
 * Walks the response tree looking for seat assignments, SSR codes, and ancillary offers.
 * Non-blocking — always returns results instead of throwing.
 */

}