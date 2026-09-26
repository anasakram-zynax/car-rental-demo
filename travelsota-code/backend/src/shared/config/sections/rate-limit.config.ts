import type { RateLimitRuntimeConfig } from '../app-config.types';
import { getNumber } from '../env.utils';

const DEFAULT_RATE_LIMIT_TTL_MS = 60000;
const DEFAULT_RATE_LIMIT_LIMIT = 30;

/** Per-tier defaults — admin/staff get the most generous limits. */
const DEFAULT_TIER_LIMITS: Record<string, number> = {
  anonymous: 20,
  customer: 60,
  staff: 150,
  agent: 200,
};

export function buildRateLimitConfig(
  env: NodeJS.ProcessEnv,
): RateLimitRuntimeConfig {
  const globalTtlMs = getNumber(env, 'RATE_LIMIT_TTL_MS', DEFAULT_RATE_LIMIT_TTL_MS);
  const globalLimit = getNumber(env, 'RATE_LIMIT_LIMIT', DEFAULT_RATE_LIMIT_LIMIT);

  const tiers = {
    anonymous: {
      limit: getNumber(env, 'RATE_LIMIT_ANONYMOUS_LIMIT', DEFAULT_TIER_LIMITS.anonymous),
      ttlMs: globalTtlMs,
    },
    customer: {
      limit: getNumber(env, 'RATE_LIMIT_CUSTOMER_LIMIT', DEFAULT_TIER_LIMITS.customer),
      ttlMs: globalTtlMs,
    },
    staff: {
      limit: getNumber(env, 'RATE_LIMIT_STAFF_LIMIT', DEFAULT_TIER_LIMITS.staff),
      ttlMs: globalTtlMs,
    },
    agent: {
      limit: getNumber(env, 'RATE_LIMIT_AGENT_LIMIT', DEFAULT_TIER_LIMITS.agent),
      ttlMs: globalTtlMs,
    },
  };

  return {
    ttlMs: globalTtlMs,
    limit: globalLimit,
    tiers,
  };
}
