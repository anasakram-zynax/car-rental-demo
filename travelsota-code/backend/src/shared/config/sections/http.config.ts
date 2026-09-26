import type { HttpRuntimeConfig } from '../app-config.types';
import { getNumber } from '../env.utils';

export function buildHttpConfig(env: NodeJS.ProcessEnv): HttpRuntimeConfig {
  return {
    defaultTimeoutMs: getNumber(env, 'HTTP_DEFAULT_TIMEOUT_MS', 60000),
    defaultRetries: getNumber(env, 'HTTP_DEFAULT_RETRIES', 1),
    retryDelayMs: getNumber(env, 'HTTP_RETRY_DELAY_MS', 300),
  };
}
