"use client";

// Count-up with a "never show a loading state" contract — smoothness edition.
//
// Contract (unchanged from v1):
//  1. Renders a number instantly on mount and starts animating from zero —
//     no shimmer/skeleton phase, ever.
//  2. While the real value is UNKNOWN (`value` undefined — API in flight or
//     down), the animation targets a FALLBACK: the last value cached in
//     localStorage for this metric (repeat visits) or `capValue` (first
//     visit). It animates there and HOLDS — the count always has a limit
//     and never runs indefinitely.
//  3. When the real value arrives the displayed number SNAPS to it instantly
//     (no second ramp: "$10,000 → $5,000 converts instantly") and the cache
//     is updated, so the next visit counts only up to the fresh value.
//
// IMPORTANT: `value === 0` is a REAL value (the API answered zero). Absence
// of data must be passed as `undefined`, never as 0 — otherwise the
// provisional animation never runs and 0 gets cached over real values.
//
// Smoothness model (why v1 felt "too fast"/jerky):
// - v1 called setState ~60×/sec × 4 cards → 240 React renders/sec fighting
//   the dashboard's chart mounts for the main thread. Frames dropped, so the
//   curve LOOKED fast and jumpy even though its duration was short.
// - v2 writes the formatted string straight to the DOM node from a single
//   rAF loop (zero React renders during counting) and uses a longer
//   easeOutExpo timeline — fast, confident start with a long, soft settle.
//   Digits also share a fixed tabular grid (tabular-nums) so width doesn't
//   jitter while counting.

import { memo, useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

interface CountUpProps {
  /** Real value from the API. `undefined` = not known yet → provisional mode. */
  value?: number;
  /** Formatter applied to the animated number. */
  format?: (n: number) => string;
  /**
   * Animation duration in ms. Default 2200 with an easeOutCubic timeline:
   * a confident start, a long graceful settle. (The earlier 1400ms easeOutExpo
   * covered ~80% of the distance in the first third — users read that as
   * "too fast". The gentler cubic spreads the visible motion across the full
   * timeline so the count reads as deliberate rather than rushed.)
   */
  duration?: number;
  className?: string;
  /**
   * Stable metric name for the localStorage fallback cache, e.g.
   * "admin-dashboard-total-revenue". Omit to disable caching.
   */
  cacheKey?: string;
  /**
   * Counting limit while the real value is unknown and no cache exists
   * yet (first visit). The animation stops here and holds — it never
   * runs indefinitely when the backend is slow or down.
   */
  capValue?: number;
}

// easeOutCubic: fast enough to feel alive, gentle enough to feel deliberate.
const easeOutCubic = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
const CACHE_PREFIX = "countup:";

function readCachedValue(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeCachedValue(key: string, value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, String(value));
  } catch {
    // Storage unavailable (private mode/quota) — caching is best-effort.
  }
}

// memo + stable props (module-level formatter, primitive strings/numbers) guarantee
// the parent's isLoading/period re-renders NEVER reset the DOM text mid-animation —
// the rAF loop exclusively owns textContent until the real value arrives.
export const CountUp = memo(function CountUp({ value, format, duration = 1000, className, cacheKey, capValue }: CountUpProps) {
  const reducedMotion = useReducedMotion();
  // Stable refs for the rAF loop — the loop must never need re-arming when
  // a formatter identity changes between renders.
  const nodeRef = useRef<HTMLSpanElement | null>(null);
  const formatRef = useRef(format);
  formatRef.current = format;
  // Flips true the first time a real value exists — the provisional rAF
  // loop checks this every frame and stops.
  const settledRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const hasRealValue = typeof value === "number" && Number.isFinite(value);

  useEffect(() => {
    // Real value present: stop any provisional loop and persist the value so
    // subsequent visits count only up to it.
    if (hasRealValue) {
      settledRef.current = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (cacheKey) writeCachedValue(cacheKey, value);
      return;
    }

    // Provisional mode (no real value yet): 0 → (cached ?? cap), then HOLD.
    // Runs once per mount; the fallback target cannot meaningfully change
    // mid-session. The DOM is written directly — no React renders.
    if (settledRef.current) return;
    const node = nodeRef.current;
    if (!node) return;

    const cached = cacheKey ? readCachedValue(cacheKey) : null;
    const target = cached ?? capValue ?? 0;
    if (target <= 0) return; // nothing provisional to count toward

    const render = (n: number) => {
      const fmt = formatRef.current;
      node.textContent = fmt ? fmt(n) : Math.round(n).toLocaleString();
    };

    if (reducedMotion) {
      render(target);
      return;
    }

    let start: number | null = null;
    const tick = (now: number) => {
      if (settledRef.current) return;
      if (start === null) start = now;
      const t = Math.min((now - start) / duration, 1);
      render(target * easeOutCubic(t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null; // hold at the fallback — hard stop, no loop
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRealValue]);

  // The displayed number is derived here on every render: the real value
  // wins whenever present (also the SSR/hydration output), otherwise the
  // provisional animation state (which holds at the cached fallback or cap).
  const shown = hasRealValue ? value : 0;
  const out = format ? format(shown) : Math.round(shown).toLocaleString();
  return (
    <span ref={nodeRef} className={className} suppressHydrationWarning>
      {out}
    </span>
  );
});
