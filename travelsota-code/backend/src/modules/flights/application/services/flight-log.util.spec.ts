import { sanitizeForLog, logCtx, redact } from './flight-log.util';

describe('sanitizeForLog', () => {
  it('redacts known PII fields at top level', () => {
    const input = {
      email: 'john@example.com',
      givenName: 'John',
      password: 'secret123',
      status: 'OK',
      offerCount: 5,
    };
    const result = sanitizeForLog(input) as Record<string, unknown>;
    expect(result.email).toBe('<redacted>');
    expect(result.givenName).toBe('<redacted>');
    expect(result.password).toBe('<redacted>');
    expect(result.status).toBe('OK');
    expect(result.offerCount).toBe(5);
  });

  it('redacts PII in nested PersonName', () => {
    const input = {
      PersonName: {
        '@type': 'PersonNameDetail',
        Given: 'John',
        Surname: 'Doe',
      },
      status: 'OK',
    };
    const result = sanitizeForLog(input) as Record<string, unknown>;
    const name = result.PersonName as Record<string, unknown>;
    expect(name.Given).toBe('<redacted>');
    expect(name.Surname).toBe('<redacted>');
    expect(name['@type']).toBe('PersonNameDetail');
  });

  it('truncates large arrays', () => {
    const input = { items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
    const result = sanitizeForLog(input, 3, 3) as Record<string, unknown>;
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as unknown[]).length).toBe(4); // 3 items + 1 summary
    const last = (result.items as unknown[])[3];
    expect(String(last)).toContain('+7 more');
  });

  it('replaces deeply nested objects beyond max depth', () => {
    const input = { level1: { level2: { level3: { key: 'deep' } } } };
    const result = sanitizeForLog(input, 2, 3) as Record<string, unknown>;
    const l1 = result.level1 as Record<string, unknown>;
    const l2 = l1.level2;
    expect(l2).toBe('[Object]');
  });

  it('handles null and undefined values', () => {
    const input = { email: null, givenName: undefined, status: 'OK' };
    const result = sanitizeForLog(input) as Record<string, unknown>;
    expect(result.email).toBeNull();
    // undefined fields might not be in the result
    expect(result.status).toBe('OK');
  });

  it('handles primitive values', () => {
    expect(sanitizeForLog('hello')).toBe('hello');
    expect(sanitizeForLog(42)).toBe(42);
    expect(sanitizeForLog(null)).toBeNull();
    expect(sanitizeForLog(undefined)).toBeUndefined();
  });
});

describe('logCtx', () => {
  it('returns object with workflowId and extra fields', () => {
    const result = logCtx('wf-123', { status: 'OK' });
    expect(result.workflowId).toBe('wf-123');
    expect(result.status).toBe('OK');
  });

  it('works without extra fields', () => {
    const result = logCtx('wf-456');
    expect(result.workflowId).toBe('wf-456');
    expect(Object.keys(result)).toEqual(['workflowId']);
  });
});

describe('redact', () => {
  it('redacts strings showing first 2 and last 2 chars', () => {
    expect(redact('john.doe@example.com')).toBe('jo***om');
  });

  it('returns *** for strings shorter than 4 chars', () => {
    expect(redact('ab')).toBe('***');
    expect(redact('')).toBe('***');
  });
});
