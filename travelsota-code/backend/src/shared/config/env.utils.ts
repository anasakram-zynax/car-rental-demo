const POSITIVE_INT_REGEX = /^\d+$/;

export function getString(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue?: string,
): string | undefined {
  const raw = env[key];
  if (raw === undefined) {
    return defaultValue;
  }

  const value = raw.trim();
  return value.length > 0 ? value : defaultValue;
}

export function getNumber(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: number,
): number {
  const raw = getString(env, key);
  if (!raw) {
    return defaultValue;
  }

  if (!POSITIVE_INT_REGEX.test(raw)) {
    throw new Error(`Invalid ${key}. Expected a positive integer.`);
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${key}. Expected a positive integer.`);
  }

  return parsed;
}

export function getBoolean(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: boolean,
): boolean {
  const raw = getString(env, key);
  if (!raw) {
    return defaultValue;
  }

  const normalized = raw.toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  throw new Error(`Invalid ${key}. Expected true or false.`);
}

export function getCsvList(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: string[],
): string[] {
  const raw = getString(env, key);
  if (!raw) {
    return defaultValue;
  }

  const list = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return list.length > 0 ? list : defaultValue;
}

export function ensureUrl(value: string, key: string): string {
  try {
    new URL(value);
    return value;
  } catch {
    throw new Error(`Invalid ${key}. Expected a valid URL.`);
  }
}
