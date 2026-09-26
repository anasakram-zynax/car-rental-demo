/**
 * IP classification helpers shared by the trust-proxy configuration,
 * geo lookups, and admin IP displays.
 *
 * An address is "private" when it can never appear as a public client
 * address on the internet: loopback, RFC1918 LANs, link-local, CGNAT
 * (100.64/10), ULA IPv6, IPv4-mapped IPv6, benchmark/multicast/reserved
 * ranges. Everything else is treated as public/global.
 */

const PRIVATE_IPV4_PATTERNS: Array<[number, number]> = [
  [0x00000000, 0xff000000], // 0.0.0.0/8         "this network"
  [0x0a000000, 0xff000000], // 10.0.0.0/8        RFC1918
  [0x7f000000, 0xff000000], // 127.0.0.0/8       loopback
  [0xa9fe0000, 0xffff0000], // 169.254.0.0/16    link-local
  [0xac100000, 0xfff00000], // 172.16.0.0/12     RFC1918
  [0xc0000000, 0xffffff00], // 192.0.0.0/24      IETF protocol assignments
  [0xc0000200, 0xffffff00], // 192.0.2.0/24      TEST-NET-1 (docs)
  [0xc0a80000, 0xffff0000], // 192.168.0.0/16    RFC1918
  [0xc6120000, 0xfffe0000], // 198.18.0.0/15     benchmarking
  [0xc6336400, 0xffffff00], // 198.51.100.0/24   documentation
  [0xcb007100, 0xffffff00], // 203.0.113.0/24    documentation
  [0x64400000, 0xffc00000], // 100.64.0.0/10     CGNAT / shared address space
  [0xe0000000, 0xf0000000], // 224.0.0.0/4       multicast
  [0xf0000000, 0xf0000000], // 240.0.0.0/4       reserved
];

export type IpClass = 'public' | 'private' | 'unknown';

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return false;
  return PRIVATE_IPV4_PATTERNS.some(
    ([base, mask]) => (value & mask) >>> 0 === base >>> 0,
  );
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped / IPv4-compatible (::ffff:a.b.c.d).
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);

  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 link-local
  if (/^ff[0-9a-f]{2}:/.test(lower)) return true; // multicast
  return false;
}

/** Classify an address. Returns 'unknown' for garbage/unparseable input. */
export function classifyIp(rawIp: string | null | undefined): IpClass {
  if (!rawIp) return 'unknown';
  const ip = rawIp
    .trim()
    .replace(/^\[|\]$/g, '')
    .split('%')[0]; // strip brackets/zone
  if (!ip) return 'unknown';
  if (ip.includes(':')) return isPrivateIpv6(ip) ? 'private' : 'public';
  if (ip.includes('.')) return isPrivateIpv4(ip) ? 'private' : 'public';
  return 'unknown';
}

/** True for addresses that can never be a public client (loopback, LAN, …). */
export function isPrivateIp(rawIp: string | null | undefined): boolean {
  return classifyIp(rawIp) === 'private';
}

/**
 * Express `trust proxy` callback: trust the hop in front of us only when it
 * is a private/loopback address (our own reverse proxy, docker sidecar…).
 * Public peers are the real client — their (spoofable) X-Forwarded-For
 * headers are ignored, so clients cannot forge an IP by sending headers
 * directly. Handles any number of local proxy hops without configuration.
 */
export function trustPrivatePeers(addr: string): boolean {
  const cls = classifyIp(addr);
  return cls === 'private' || cls === 'unknown';
}
