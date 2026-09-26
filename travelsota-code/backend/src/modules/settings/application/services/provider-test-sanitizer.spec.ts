import {
  sanitizeProviderDiagnostics,
  sanitizeUpstreamResponse,
} from './provider-test-sanitizer';

describe('provider-test-sanitizer', () => {
  describe('sanitizeProviderDiagnostics', () => {
    it('masks apiKey fields', () => {
      const input = { apiKey: 'my-secret-key-1234' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.apiKey).toContain('•');
      expect(result.apiKey).not.toContain('my-secret-key');
    });

    it('masks secret fields', () => {
      const input = { secret: 'super-secret-value' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.secret).toContain('•');
      expect(result.secret).not.toContain('super-secret');
    });

    it('masks password fields', () => {
      const input = { password: 'my-password-123' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.password).toContain('•');
      expect(result.password).not.toContain('my-password');
    });

    it('masks token fields', () => {
      const input = { token: 'eyJhbGciOiJIUzI1NiJ9.token-value' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.token).toContain('•');
      expect(result.token).not.toContain('token-value');
    });

    it('masks authorization fields', () => {
      const input = { Authorization: 'Bearer secret-token-here' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.Authorization).toContain('•');
      expect(result.Authorization).not.toContain('Bearer');
    });

    it('masks clientSecret fields', () => {
      const input = { clientSecret: 'my-client-secret-123' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.clientSecret).toContain('•');
      expect(result.clientSecret).not.toContain('my-client');
    });

    it('masks webhookSecret fields', () => {
      const input = { webhookSecret: 'whsec_abc123def456' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.webhookSecret).toContain('•');
      expect(result.webhookSecret).not.toContain('whsec');
    });

    it('masks sslKey fields', () => {
      const input = { sslKey: '-----BEGIN PRIVATE KEY-----\nABCD' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.sslKey).toContain('•');
      expect(result.sslKey).not.toContain('PRIVATE KEY');
    });

    it('masks sslCert fields', () => {
      const input = { sslCert: '-----BEGIN CERTIFICATE-----\nABCD' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.sslCert).toContain('•');
      expect(result.sslCert).not.toContain('CERTIFICATE');
    });

    it('masks api_secret fields (underscore variant)', () => {
      const input = { api_secret: 'my-api-secret-value' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.api_secret).toContain('•');
    });

    it('masks ApiKey fields (camelCase variant)', () => {
      const input = { ApiKey: 'my-api-key-value' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.ApiKey).toContain('•');
    });

    it('keeps last 4 characters visible for strings longer than 8 chars', () => {
      const input = { apiKey: 'my-secret-key-1234' }; // length 18
      const result = sanitizeProviderDiagnostics(input);
      expect(result.apiKey).toMatch(/1234$/);
      expect(result.apiKey).toContain('•');
    });

    it('returns 8 dots with last 4 chars for strings of length 5-8', () => {
      // For values <= 4 chars: full mask
      const veryShort = sanitizeProviderDiagnostics({ apiKey: 'ab' } as any);
      expect(veryShort.apiKey).toBe('••••••••');

      // For values > 4 chars: 8 dots + last 4 chars
      // 'short'.slice(-4) === 'hort'
      const result = sanitizeProviderDiagnostics({ apiKey: 'short' } as any);
      expect(result.apiKey).toBe('••••••••hort');
    });

    it('masks access_token fields', () => {
      const input = { access_token: 'eyJhbGciOiJIUzI1NiJ9.token-value' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.access_token).toContain('•');
      expect(result.access_token).not.toContain('eyJhbGci');
    });

    it('masks signature fields', () => {
      const input = { signature: 'abc123def456signature' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.signature).toContain('•');
      expect(result.signature).not.toContain('abc123');
    });

    it('recursively sanitizes nested objects', () => {
      const input = {
        provider: 'ratehawk',
        credentials: {
          apiKey: 'my-secret-key-1234',
          secret: 'my-secret',
        },
        metadata: {
          internal: {
            token: 'eyJhbGci.token',
          },
        },
      };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.credentials.apiKey).toContain('•');
      expect(result.credentials.apiKey).not.toContain('my-secret-key');
      expect(result.credentials.secret).toContain('•');
      expect(result.credentials.secret).not.toContain('my-secret');
      expect(result.metadata.internal.token).toContain('•');
      expect(result.metadata.internal.token).not.toContain('eyJhbGci');
      expect(result.provider).toBe('ratehawk');
    });

    it('sanitizes arrays of objects', () => {
      const input = {
        items: [
          { name: 'endpoint1', apiKey: 'secret-1-1234' },
          { name: 'endpoint2', apiKey: 'secret-2-5678' },
        ],
      };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.items[0].apiKey).toContain('•');
      expect(result.items[0].apiKey).toMatch(/1234$/);
      expect(result.items[1].apiKey).toContain('•');
      expect(result.items[1].apiKey).toMatch(/5678$/);
      expect(result.items[0].name).toBe('endpoint1');
    });

    it('preserves non-secret fields', () => {
      const input = {
        provider: 'ratehawk',
        module: 'hotels',
        environment: 'sandbox',
        success: true,
        durationMs: 842,
        checks: [
          { id: 'auth', status: 'success', message: 'OK' },
        ],
      };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.provider).toBe('ratehawk');
      expect(result.module).toBe('hotels');
      expect(result.environment).toBe('sandbox');
      expect(result.success).toBe(true);
      expect(result.durationMs).toBe(842);
      expect(result.checks[0].id).toBe('auth');
    });

    it('handles null and undefined values', () => {
      expect(sanitizeProviderDiagnostics(null as any)).toBeNull();
      expect(sanitizeProviderDiagnostics(undefined as any)).toBeUndefined();
    });

    it('handles empty objects', () => {
      const result = sanitizeProviderDiagnostics({});
      expect(result).toEqual({});
    });

    it('does not mutate the original object', () => {
      const input = { apiKey: 'my-secret-key-1234', name: 'test' };
      const result = sanitizeProviderDiagnostics(input);
      expect(result.apiKey).not.toBe(input.apiKey);
      expect(input.apiKey).toBe('my-secret-key-1234');
      expect(result.name).toBe(input.name);
    });
  });

  describe('sanitizeUpstreamResponse', () => {
    it('returns null for null input', () => {
      expect(sanitizeUpstreamResponse(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(sanitizeUpstreamResponse(undefined)).toBeNull();
    });

    it('sanitizes upstream response secrets', () => {
      const input = {
        status: 'ok',
        data: {
          access_token: 'eyJhbGci.token',
          api_key: 'my-key-1234',
          user: { name: 'John' },
        },
      };
      const result = sanitizeUpstreamResponse(input);
      expect(result!.status).toBe('ok');
      expect(result!.data.access_token).toContain('•');
      expect(result!.data.access_token).not.toContain('eyJhbGci');
      expect(result!.data.api_key).toContain('•');
      expect(result!.data.user.name).toBe('John');
    });
  });
});
