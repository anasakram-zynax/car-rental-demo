import { buildAppRuntimeConfig } from './app.config';

describe('buildAppRuntimeConfig', () => {
  it('does not trust forwarded headers by default', () => {
    const config = buildAppRuntimeConfig({ NODE_ENV: 'production', PORT: '3000' });

    expect(config.trustProxyHops).toBe(0);
  });

  it('allows an explicitly verified non-negative proxy hop count', () => {
    const config = buildAppRuntimeConfig({
      NODE_ENV: 'production',
      PORT: '3000',
      TRUST_PROXY_HOPS: '1',
    });

    expect(config.trustProxyHops).toBe(1);
  });

  it('rejects invalid proxy hop configuration', () => {
    expect(() =>
      buildAppRuntimeConfig({ NODE_ENV: 'production', PORT: '3000', TRUST_PROXY_HOPS: '-1' }),
    ).toThrow('Invalid TRUST_PROXY_HOPS');

    expect(() =>
      buildAppRuntimeConfig({ NODE_ENV: 'production', PORT: '3000', TRUST_PROXY_HOPS: 'one' }),
    ).toThrow('Invalid TRUST_PROXY_HOPS');
  });
});
