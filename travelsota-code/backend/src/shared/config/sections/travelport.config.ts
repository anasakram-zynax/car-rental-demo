import type {
  HttpRuntimeConfig,
  OauthClientAuthMode,
  TravelportRuntimeConfig,
} from '../app-config.types';
import { getBoolean, getNumber, getString } from '../env.utils';

function getOauthClientAuthMode(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: OauthClientAuthMode,
): OauthClientAuthMode {
  const raw = getString(env, key);
  if (!raw) {
    return defaultValue;
  }

  const normalized = raw.toLowerCase();
  if (normalized === 'basic' || normalized === 'body') {
    return normalized;
  }

  throw new Error(`Invalid ${key}. Allowed values are basic or body.`);
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, '');
}

function validateTravelportCredentials(config: TravelportRuntimeConfig): void {
  const credentialFields = [
    config.username,
    config.password,
    config.clientId,
    config.clientSecret,
  ];
  const configuredFields = credentialFields.filter(Boolean).length;

  if (configuredFields === 0) {
    return;
  }

  if (configuredFields !== credentialFields.length) {
    throw new Error(
      'Incomplete Travelport credentials. Set TRAVELPORT_USERNAME, TRAVELPORT_PASSWORD, TRAVELPORT_CLIENT_ID, and TRAVELPORT_CLIENT_SECRET together.',
    );
  }
}

export function buildTravelportConfig(
  env: NodeJS.ProcessEnv,
  http: HttpRuntimeConfig,
): TravelportRuntimeConfig {
  const travelport: TravelportRuntimeConfig = {
    authUrl:
      getString(env, 'TRAVELPORT_AUTH_URL') ??
      'https://auth.pp.travelport.net/oauth/token',
    baseUrl: normalizeBaseUrl(
      getString(env, 'TRAVELPORT_BASE_URL') ?? 'https://api.pp.travelport.net',
    ),
    acceptVersion: getString(env, 'TRAVELPORT_ACCEPT_VERSION') ?? '11',
    contentVersion: getString(env, 'TRAVELPORT_CONTENT_VERSION') ?? '11',
    requestTimeoutMs: getNumber(
      env,
      'TRAVELPORT_REQUEST_TIMEOUT_MS',
      http.defaultTimeoutMs,
    ),
    // Always search both content sources by default (GDS + NDC). No longer
    // configurable via env — a GDS-only or NDC-only default silently starves
    // one channel and caused "zero results" on routes the other source serves.
    defaultContentSourceList: ['GDS', 'NDC'],
    oauthGrantType: getString(env, 'TRAVELPORT_OAUTH_GRANT_TYPE') ?? 'password',
    oauthClientAuthMode: getOauthClientAuthMode(
      env,
      'TRAVELPORT_OAUTH_CLIENT_AUTH_MODE',
      'basic',
    ),
    includeAccessGroupInToken: getBoolean(
      env,
      'TRAVELPORT_INCLUDE_ACCESS_GROUP_IN_TOKEN',
      false,
    ),
    username: getString(env, 'TRAVELPORT_USERNAME'),
    password: getString(env, 'TRAVELPORT_PASSWORD'),
    clientId: getString(env, 'TRAVELPORT_CLIENT_ID'),
    clientSecret: getString(env, 'TRAVELPORT_CLIENT_SECRET'),
    accessGroup: getString(env, 'TRAVELPORT_ACCESS_GROUP'),
    pcc: getString(env, 'TRAVELPORT_PCC'),
    gds: getString(env, 'TRAVELPORT_GDS') ?? '1G',
    allowLegacyLocator: getBoolean(
      env,
      'TRAVELPORT_ALLOW_LEGACY_LOCATOR',
      false,
    ),
    strictReprice: getBoolean(env, 'TRAVELPORT_STRICT_REPRICE', false),
  };

  validateTravelportCredentials(travelport);

  return travelport;
}
