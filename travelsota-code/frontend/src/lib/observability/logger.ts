type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LEVEL: LogLevel =
  process.env.NODE_ENV === 'production' ? 'info' : 'debug';

export function createLogger(scope: string) {
  const minPriority = LOG_LEVEL_PRIORITY[DEFAULT_LEVEL];

  function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    if (LOG_LEVEL_PRIORITY[level] < minPriority) {
      return;
    }

    const payload = meta ? { scope, ...meta } : { scope };
    const entry = `[${scope}] ${message}`;

    if (level === 'debug') {
      console.debug(entry, payload);
      return;
    }

    if (level === 'info') {
      console.info(entry, payload);
      return;
    }

    if (level === 'warn') {
      console.warn(entry, payload);
      return;
    }

    console.error(entry, payload);
  }

  return {
    debug: (message: string, meta?: Record<string, unknown>) =>
      log('debug', message, meta),
    info: (message: string, meta?: Record<string, unknown>) =>
      log('info', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) =>
      log('warn', message, meta),
    error: (message: string, meta?: Record<string, unknown>) =>
      log('error', message, meta),
  };
}
