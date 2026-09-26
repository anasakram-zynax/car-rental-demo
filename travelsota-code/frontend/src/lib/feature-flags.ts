/**
 * Application feature flags.
 *
 * Flags are controlled via `NEXT_PUBLIC_*` environment variables so they are
 * available at runtime in the browser. Each flag has a safe default for
 * local development.
 */

/**
 * When true, the UI will fall back to hardcoded meal SSR options if the
 * Travelport ancillary catalog returns no meal options.
 *
 * Phase 5+ should always use real catalog data. This flag exists for
 * transitional testing.
 *
 * Default: false — meal options come from the unified catalog endpoint.
 * Set NEXT_PUBLIC_ENABLE_FALLBACK_MEALS=true in .env.local to re-enable.
 */
export const ENABLE_FALLBACK_MEALS =
  process.env.NEXT_PUBLIC_ENABLE_FALLBACK_MEALS === 'true';

export const featureFlags = {
  ENABLE_FALLBACK_MEALS,
} as const;
