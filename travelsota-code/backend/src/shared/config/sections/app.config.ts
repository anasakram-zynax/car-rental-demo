import type { AppRuntimeConfig } from '../app-config.types';
import { getNumber, getString } from '../env.utils';

export function buildAppRuntimeConfig(
  env: NodeJS.ProcessEnv,
): AppRuntimeConfig {
  const rawTrustProxyHops = getString(env, 'TRUST_PROXY_HOPS');
  const trustProxyHops = rawTrustProxyHops === undefined ? 0 : Number(rawTrustProxyHops);

  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error('Invalid TRUST_PROXY_HOPS. Expected a non-negative integer.');
  }

  return {
    nodeEnv: getString(env, 'NODE_ENV', 'development') ?? 'development',
    port: getNumber(env, 'PORT', 3000),
    trustProxyHops,
  };
}
