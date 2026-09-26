import { Injectable, Logger } from '@nestjs/common';
import { isPrivateIp } from '../../../shared/network/ip-classify.util';

/**
 * Best-effort IP → ISO 3166-1 alpha-2 country lookup for the demo-leads
 * globe. Designed to never block or fail a request:
 * - 2s timeout, single attempt, failures cached as null (negative cache).
 * - Results cached for 7 days per IP (IPs are stable enough at demo scale).
 * - Private/loopback IPs (localhost, LAN) resolve to null — no lookup.
 * - Set DEMO_GEO_DISABLED=1 to skip lookups entirely (self-hosted offline).
 */
@Injectable()
export class DemoGeoService {
  private readonly logger = new Logger(DemoGeoService.name);
  private readonly cache = new Map<
    string,
    { country: string | null; at: number }
  >();
  private readonly inflight = new Map<string, Promise<string | null>>();

  private static readonly NEGATIVE_TTL_MS = 10 * 60 * 1000; // failures retry in 10 min
  private static readonly POSITIVE_TTL_MS = 7 * 24 * 3600 * 1000;
  private static readonly MAX_CACHE_ENTRIES = 20_000;

  /** Returns an ISO alpha-2 country code, or null when unknown. Never throws. */
  async countryForIp(ip: string | null | undefined): Promise<string | null> {
    if (!ip || process.env.DEMO_GEO_DISABLED === '1') return null;

    const normalized = ip.trim();
    if (isPrivateIp(normalized)) return null; // loopback/LAN/CGNAT: not geo-locatable

    const cached = this.cache.get(normalized);
    if (cached) {
      const ttl = cached.country
        ? DemoGeoService.POSITIVE_TTL_MS
        : DemoGeoService.NEGATIVE_TTL_MS;
      if (Date.now() - cached.at < ttl) return cached.country;
      this.cache.delete(normalized);
    }

    const existing = this.inflight.get(normalized);
    if (existing) return existing;

    const lookup = this.lookup(normalized);
    this.inflight.set(normalized, lookup);
    try {
      const country = await lookup;
      if (this.cache.size >= DemoGeoService.MAX_CACHE_ENTRIES) {
        // Drop the oldest quarter — demo-scale traffic never gets near this.
        const drop = Math.ceil(this.cache.size / 4);
        const keys = this.cache.keys();
        for (let i = 0; i < drop; i++) {
          const k = keys.next();
          if (k.done) break;
          this.cache.delete(k.value);
        }
      }
      this.cache.set(normalized, { country, at: Date.now() });
      return country;
    } finally {
      this.inflight.delete(normalized);
    }
  }

  /**
   * Provider chain, tried in order (first success wins):
   *  1. ipwho.is  — free, HTTPS, no key
   *  2. freeipapi.com — free, HTTPS, no key
   *  3. ip-api.com — free but HTTP-only; kept as last resort (fine for a
   *     non-sensitive country code; swap for a paid provider if your CSP
   *     forbids mixed outbound traffic).
   */
  private async lookup(ip: string): Promise<string | null> {
    const providers: Array<(ip: string) => Promise<string | null>> = [
      async (target) => {
        const data = await this.fetchJson(
          `https://ipwho.is/${encodeURIComponent(target)}`,
        );
        return typeof data?.country_code === 'string' && data.country_code
          ? data.country_code.toUpperCase()
          : null;
      },
      async (target) => {
        const data = await this.fetchJson(
          `https://freeipapi.com/api/json/${encodeURIComponent(target)}`,
        );
        return typeof data?.countryCode === 'string' && data.countryCode
          ? data.countryCode.toUpperCase()
          : null;
      },
      async (target) => {
        const data = await this.fetchJson(
          `http://ip-api.com/json/${encodeURIComponent(target)}?fields=status,countryCode`,
        );
        return typeof data?.countryCode === 'string' && data.countryCode
          ? data.countryCode.toUpperCase()
          : null;
      },
    ];

    for (const provider of providers) {
      try {
        const country = await provider(ip);
        if (country) return country;
      } catch (err) {
        this.logger.debug(
          `Geo provider failed for ${ip}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return null;
  }

  /** Single HTTPS/HTTP GET with a hard 2.5s timeout. Throws on failure. */
  private async fetchJson(
    url: string,
  ): Promise<Record<string, unknown> | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      return (await res.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  }
}
