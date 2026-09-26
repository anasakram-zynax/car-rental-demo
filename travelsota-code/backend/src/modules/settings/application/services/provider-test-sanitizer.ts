/**
 * Sanitizes provider diagnostic data to ensure no secrets are leaked.
 * Used before returning any test connection response to the client.
 */

const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /api[_-]?secret/i,
  /^secret$/i,
  /^password$/i,
  /^token$/i,
  /access_token/i,
  /^auth$/i,
  /authorization/i,
  /^bearer$/i,
  /^x-signature$/i,
  /^signature$/i,
  /^ssl[Ck]ey/i,
  /^ssl[Cc]ert/i,
  /webhook[_-]?secret/i,
  /client[_-]?secret/i,
  /private[_-]?key/i,
];

function isSecretKey(key: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(key));
}

function maskValue(value: unknown): unknown {
  if (typeof value === 'string' && value.length > 4) {
    return `${'•'.repeat(8)}${value.slice(-4)}`;
  }
  if (typeof value === 'string') {
    return '•'.repeat(8);
  }
  return value;
}

/**
 * Recursively sanitize an object by masking known secret fields.
 * Returns a new object — does not mutate the original.
 */
export function sanitizeProviderDiagnostics<T extends Record<string, unknown>>(data: T): T {
  if (!data || typeof data !== 'object') return data;

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (isSecretKey(key)) {
      sanitized[key] = maskValue(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeProviderDiagnostics(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => {
        if (item && typeof item === 'object') {
          return sanitizeProviderDiagnostics(item as Record<string, unknown>);
        }
        return item;
      });
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

/**
 * Sanitize a raw HTTP response body before including it in diagnostics.
 * Strips known secret fields to prevent accidental exposure.
 */
export function sanitizeUpstreamResponse(
  body: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!body) return null;
  return sanitizeProviderDiagnostics(body);
}
