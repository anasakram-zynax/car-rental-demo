/**
 * Sanitize an object for safe logging — strips known PII fields and truncates
 * large arrays / deep objects to prevent log flooding.
 *
 * PII fields are replaced with their type indicator (e.g. "<string>").
 * Non-PII fields are preserved. Large arrays are truncated to 3 items + count.
 */
const PII_KEYS = new Set([
  'givenName', 'Given', 'given_name',
  'surname', 'Surname', 'lastName',
  'email', 'Email', 'value', // value inside Email blocks
  'phoneNumber', 'phone', 'Telephone',
  'countryAccessCode',
  'documentNumber', 'documentType',
  'issueCountry', 'issueDate',
  'expiryDate', 'nationality', 'birthPlace',
  'password', 'Password', 'clientSecret',
  'access_token',
]);

const PII_KEY_PREFIXES = ['document', 'phone', 'email'];

function isLikelyPii(key: string): boolean {
  if (PII_KEYS.has(key)) return true;
  const lower = key.toLowerCase();
  return PII_KEY_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Returns a shallow-sanitized copy of an object suitable for logging.
 * Does NOT deeply traverse — focuses on top-level and one-level-deep known PII fields.
 */
export function sanitizeForLog(
  value: unknown,
  maxDepth = 3,
  maxArrayItems = 3,
  _currentDepth = 0,
): unknown {
  if (_currentDepth >= maxDepth) {
    if (Array.isArray(value)) return `[Array(${value.length})]`;
    if (value && typeof value === 'object') return '[Object]';
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > maxArrayItems) {
      const items = value.slice(0, maxArrayItems).map((item) =>
        sanitizeForLog(item, maxDepth, maxArrayItems, _currentDepth + 1),
      );
      items.push(`... +${value.length - maxArrayItems} more`);
      return items;
    }
    return value.map((item) =>
      sanitizeForLog(item, maxDepth, maxArrayItems, _currentDepth + 1),
    );
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(record)) {
      if (isLikelyPii(key)) {
        if (val === null || val === undefined) {
          result[key] = val;
        } else if (typeof val === 'string') {
          result[key] = val.length > 0 ? '<redacted>' : '';
        } else {
          result[key] = '<redacted>';
        }
      } else if (key === 'PersonName' && val && typeof val === 'object') {
        const nameRecord = val as Record<string, unknown>;
        result[key] = {
          '@type': nameRecord['@type'],
          Given: nameRecord.Given ? '<redacted>' : undefined,
          Surname: nameRecord.Surname ? '<redacted>' : undefined,
        };
      } else {
        result[key] = sanitizeForLog(val, maxDepth, maxArrayItems, _currentDepth + 1);
      }
    }

    return result;
  }

  return value;
}

/**
 * Build a structured log context object with a workflow trace ID.
 */
export function logCtx(workflowId: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    workflowId,
    ...extra,
  };
}

/**
 * Redact a string to show only first/last chars for sensitive values.
 * "john.doe@example.com" → "jo***om" or "test123" → "te***23"
 */
export function redact(value: string): string {
  if (!value || value.length < 4) return '***';
  return value.slice(0, 2) + '***' + value.slice(-2);
}
