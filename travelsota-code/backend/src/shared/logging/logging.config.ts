export const LoggingConfig = {
  getLogLevel(): string {
    return process.env.LOG_LEVEL ?? 'log';
  },

  isProviderDebugEnabled(): boolean {
    return process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true';
  },

  isSearchResultLoggingEnabled(): boolean {
    return process.env.ENABLE_SEARCH_RESULT_LOGS === 'true';
  },

  isWorkerDebugEnabled(): boolean {
    return process.env.ENABLE_WORKER_DEBUG_LOGS === 'true';
  },

  isNotificationDebugEnabled(): boolean {
    return process.env.ENABLE_NOTIFICATION_DEBUG === 'true';
  },

  isBootstrapDebugEnabled(): boolean {
    return process.env.ENABLE_BOOTSTRAP_DEBUG === 'true';
  },

  isSqlDebugEnabled(): boolean {
    return process.env.ENABLE_SQL_DEBUG === 'true';
  },

  getSlowRequestMs(): number {
    return Number(process.env.SLOW_REQUEST_MS) || 2000;
  },

  getVerySlowRequestMs(): number {
    return Number(process.env.VERY_SLOW_REQUEST_MS) || 8000;
  },

  getNestLoggerLevels(): ('error' | 'warn' | 'log' | 'debug' | 'verbose')[] {
    switch (this.getLogLevel()) {
      case 'error':
        return ['error'];
      case 'warn':
        return ['error', 'warn'];
      case 'debug':
        return ['error', 'warn', 'log', 'debug'];
      case 'verbose':
        return ['error', 'warn', 'log', 'debug', 'verbose'];
      case 'log':
      default:
        return ['error', 'warn', 'log'];
    }
  },

  sensitiveKeys: [
    'password', 'token', 'accessToken', 'refreshToken',
    'authorization', 'cookie', 'apiKey', 'secret',
    'card', 'cvv', 'passportNumber', 'email',
    'providerCredentials', 'clientSecret',
  ] as const,

  isPollingRoute(path: string): boolean {
    return /^\/(?:api\/v1\/)?(?:admin\/)?(?:notifications\/events|search-jobs\/[^/]+\/events|flights\/bookings\/[^/]+\/progress|hotels\/bookings\/[^/]+\/progress)/.test(path);
  },
};
