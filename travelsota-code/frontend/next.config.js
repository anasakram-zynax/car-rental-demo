/** @type {import('next').NextConfig} */

const withNextIntl = require('next-intl/plugin')();

// Backend API origin derived from env — added to CSP connect-src so the
// browser allows cross-origin fetch() calls to the NestJS server.
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
const apiOrigin = (() => { try { return new URL(apiBase).origin; } catch { return apiBase; } })();
const isDev = process.env.NODE_ENV !== 'production';
const apiWsOrigin = apiOrigin.replace(/^http/, 'ws');

const nextConfig = {
  allowedDevOrigins: ['192.168.100.143'],

  images: {
    // Supplier images (photos.hotelbeds.com etc.) are served directly — the
    // Hostinger origin cannot reach them, so the Next.js optimizer 400s.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.worldota.net',
      },
      {
        protocol: 'https',
        hostname: 'photos.hotelbeds.com',
      },
      {
        protocol: 'https',
        hostname: 'static.hotelbeds.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },

  // Proxy /api/v1/* to the NestJS backend so the frontend can use relative
  // paths and avoid CORS issues entirely.  The proxy is only active when
  // NEXT_PUBLIC_API_BASE_URL points to a remote origin (i.e. not already
  // a relative path like "/api/v1").
  // Remote (non-localhost) backends are forced to https — the Hostinger edge
  // 301-redirects plain http, which would turn POSTs into GETs.
  async rewrites() {
    if (!apiBase.startsWith('http')) return [];
    const proxyBase = apiBase.replace(/^http:\/\/(?!localhost|127\.0\.0\.1)/, 'https://');
    return [
      {
        source: '/api/v1/:path*',
        destination: `${proxyBase.replace(/\/api\/v1$/, '')}/api/v1/:path*`,
      },
    ];
  },

  async redirects() {
    return [
      {
        source: '/booking',
        destination: '/my-bookings',
        permanent: true,
      },
      {
        source: '/bookings',
        destination: '/my-bookings',
        permanent: true,
      },
    ];
  },

  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },

  turbopack: {
    root: __dirname,
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  // ─── Security Headers ────────────────────────────────────────
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://www.paypal.com https://www.paypalobjects.com https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      `connect-src 'self' https: wss: ${apiOrigin} ${apiWsOrigin}`,
      `frame-src 'self' ${apiOrigin} https://js.stripe.com https://www.paypal.com https://www.sandbox.paypal.com https://www.openstreetmap.org https://tile.openstreetmap.org`,
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    const securityHeaders = [
      // Prevent MIME-type sniffing
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // Restrict browser features
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()' },
      // Force HTTPS (HSTS) — 2 years
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      // Content Security Policy
      { key: 'Content-Security-Policy', value: csp },
      // Prevent IE from embedding pages in trusted zones
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      // Cross-origin isolation hints
      { key: 'Cross-Origin-Resource-Policy', value: isDev ? 'cross-origin' : 'same-origin' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
    ];

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);