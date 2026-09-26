import { getString } from '../env.utils';

const FALLBACK_DEV_SECRET = 'fallback-dev-secret-do-not-use-in-prod';

export interface AuthRuntimeConfig {
  jwtSecret: string;
  jwtAccessExpiry: string;
  jwtRefreshExpiry: string;
  googleClientId: string;
  googleClientSecret: string;
}

export function buildAuthConfig(
  env: NodeJS.ProcessEnv,
): AuthRuntimeConfig {
  const jwtSecret = getString(env, 'JWT_SECRET') ?? FALLBACK_DEV_SECRET;
  const isProd = (env.NODE_ENV ?? '').toLowerCase() === 'production';

  if (isProd && jwtSecret === FALLBACK_DEV_SECRET) {
    throw new Error(
      '[FATAL] JWT_SECRET is not set. Refusing to start with the fallback dev secret in production. ' +
      'Set the JWT_SECRET environment variable before starting the application.',
    );
  }

  const googleClientId = getString(env, 'GOOGLE_CLIENT_ID') ?? '';
  const googleClientSecret = getString(env, 'GOOGLE_CLIENT_SECRET') ?? '';

  if (isProd && (!googleClientId || !googleClientSecret)) {
    throw new Error(
      '[FATAL] GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in production. ' +
      'Configure Google OAuth credentials before starting the application.',
    );
  }

  return {
    jwtSecret,
    jwtAccessExpiry: getString(env, 'JWT_ACCESS_EXPIRY', '30m') ?? '30m',
    jwtRefreshExpiry: getString(env, 'JWT_REFRESH_EXPIRY', '7d') ?? '7d',
    googleClientId,
    googleClientSecret,
  };
}
