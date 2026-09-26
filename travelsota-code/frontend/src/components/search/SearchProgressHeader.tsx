'use client';

// Module-aware search-progress bar (premium loading).
//
// Contract:
// - 8px track, single brand-teal fill while searching; one restrained hue
//   per lifecycle state (no rainbow gradients).
// - The leading-edge icon is module-specific (state.kind):
//     · flights → airplane pointing right (matches the brand art), drifting
//       gently in flight; on completion it climbs nose-up and departs.
//     · hotels  → car driving right toward a bed waiting at the track's end;
//       on completion the car parks at the bed and the bed lights up.
// - Always starts from zero: the eased value resets whenever a new search id
//   appears or a finished search restarts (previously the bar stayed at 100
//   and the next search animated right→left), and the reducer's math now
//   begins near 4% instead of 20% (see derivePresentation).
// - Progress is rAF-eased toward the live target so supplier events feel
//   fluid; a live status label + percentage sit under the bar.
// - `pb-7` reserves real space below the bar (nothing overlaps filters or
//   result cards).
// - Reduced motion: no drift/sheen, values snap, no departure animation.
// Purely presentational: context lifecycle timers drive visibility;
// onDismiss stays wired so context state resets as before.

import { useState, useEffect, useRef } from 'react';
import { Plane, Car, BedDouble } from 'lucide-react';
import { useSearchProgress } from '@/context/SearchProgressContext';
import { useSupplierAccess } from '@/lib/hooks/use-supplier-access';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const HIDE_DELAY_MS: Record<string, number> = {
  succeeded: 2200,
  partial: 2200,
  failed: 3200,
};

export function SearchProgressHeader({ onDismiss }: { onDismiss?: () => void }) {
  const { state, presentation } = useSearchProgress();
  const { lifecycle } = state;
  // Supplier counts/availability are confidential (RBAC): staff/admin see the
  // operational status line; agents, customers and guests get public-safe copy.
  const { canViewSupplier } = useSupplierAccess();

  // ── eased value (owned here) ──────────────────────────────────────────
  const [smoothed, setSmoothed] = useState(0);
  const valueRef = useRef(0);

  // ── zero-start guard ──────────────────────────────────────────────────
  // valueRef must reset when a genuinely NEW run begins; otherwise a
  // finished search leaves the bar at 100 and the next one animates
  // right→left before the real search starts (the reported bug).
  // Keyed on startedAt (unique per run) rather than searchId: an optimistically
  // claimed run re-binds its id once the job POST resolves (BIND_JOB), and that
  // id change must NOT reset the eased bar mid-flight.
  const runRef = useRef<number | null>(state.startedAt);
  const prevLifecycleRef = useRef(lifecycle);

  // ── visibility ────────────────────────────────────────────────────────
  const [visible, setVisible] = useState(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    const freshRun =
      (state.startedAt !== null && state.startedAt !== runRef.current) ||
      (lifecycle === 'searching' &&
        prevLifecycleRef.current !== 'searching' &&
        prevLifecycleRef.current !== 'idle');
    if (freshRun) {
      runRef.current = state.startedAt;
      valueRef.current = 0;
      setSmoothed(0);
    }
    prevLifecycleRef.current = lifecycle;
  }, [state.startedAt, lifecycle]);

  useEffect(() => {
    if (lifecycle === 'idle') {
      const t = requestAnimationFrame(() => setVisible(false));
      return () => cancelAnimationFrame(t);
    }
    const show = requestAnimationFrame(() => {
      dismissedRef.current = false;
      setVisible(true);
    });
    const hide =
      lifecycle === 'succeeded' || lifecycle === 'partial' || lifecycle === 'failed'
        ? setTimeout(() => setVisible(false), HIDE_DELAY_MS[lifecycle] ?? 2200)
        : undefined;
    return () => {
      cancelAnimationFrame(show);
      if (hide) clearTimeout(hide);
    };
  }, [lifecycle]);

  // Fire onDismiss once when fully hidden so context can reset (legacy contract).
  useEffect(() => {
    if (!visible && lifecycle !== 'idle' && !dismissedRef.current) {
      dismissedRef.current = true;
      onDismiss?.();
    }
  }, [visible, lifecycle, onDismiss]);

  // ── rAF-smoothed progress ─────────────────────────────────────────────
  // presentation.displayProgress is the target; `smoothed` chases it with
  // exponential easing so chunky supplier events still render as motion.
  const target = lifecycle === 'searching' ? Math.max(presentation.displayProgress, 3) : 100;

  useEffect(() => {
    // Respect reduced-motion: jump straight to the target.
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      valueRef.current = target;
      setSmoothed(target);
      return;
    }
    let raf = 0;
    const tick = () => {
      const diff = target - valueRef.current;
      if (Math.abs(diff) < 0.15) {
        valueRef.current = target;
        setSmoothed(target);
        return; // stop looping until the target moves again
      }
      valueRef.current += diff * 0.09; // ease-out chase, ~700ms to settle
      setSmoothed(valueRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  if (!visible || lifecycle === 'idle') return null;

  const searching = lifecycle === 'searching';
  const failed = lifecycle === 'failed';
  const done = lifecycle === 'succeeded' || lifecycle === 'partial';

  // Restrained color system: one hue per state, flat fills.
  let fillClass = 'bg-gradient-to-r from-brand-teal-600 to-brand-teal-400';
  if (lifecycle === 'succeeded') fillClass = 'bg-emerald-500';
  else if (lifecycle === 'partial') fillClass = 'bg-gradient-to-r from-emerald-500 to-emerald-400';
  else if (failed) fillClass = 'bg-red-400';

  const pct = Math.min(Math.max(smoothed, 0), 100);
  // Puck stays inside the rounded caps (fill width stays truthful).
  const puckPct = Math.min(Math.max(pct, 2), 98.5);

  const isFlights = state.kind !== 'hotels'; // flights is the default/legacy kind

  // Live status text under the bar (reuses the derived presentation copy).
  const statusClass = failed ? 'text-red-500' : done ? 'text-emerald-600' : 'text-gray-600';
  const headline =
    canViewSupplier && presentation.staffHeadline
      ? presentation.staffHeadline
      : presentation.headline;
  const detail =
    canViewSupplier && presentation.staffDetail ? presentation.staffDetail : presentation.detail;

  const statusText = failed
    ? headline || 'Search failed — try again'
    : done
      ? `${headline}${detail ? ` · ${detail}` : ''}`
      : headline || 'Searching…';

  return (
    <div
      className={`mx-auto w-full max-w-[1280px] px-4 pb-7 pt-1 sm:px-6 lg:px-8 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      aria-hidden="true"
    >
      <div className="relative h-2 rounded-full bg-black/[0.06] ring-1 ring-inset ring-black/[0.04]">
        {/* Fill — eased by the rAF loop above; slow light sweep while active */}
        <div
          className={`absolute inset-y-0 left-0 overflow-hidden rounded-full ${fillClass} shadow-[0_1px_2px_rgba(0,0,0,0.08)]`}
          style={{ width: `${pct}%` }}
        >
          {searching && (
            <span className="motion-safe:animate-[pb-sheen_2.8s_ease-in-out_infinite] absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          )}
        </div>

        {/* Hotels: the bed waits at the end of the line */}
        {!isFlights && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
            <BedDouble
              strokeWidth={2}
              className={`h-3.5 w-3.5 transition-colors duration-500 ${
                done ? 'text-emerald-500' : failed ? 'text-red-300' : 'text-black/20'
              } ${searching ? 'motion-safe:animate-[pb-idle-pulse_2.4s_ease-in-out_infinite]' : ''}`}
            />
          </span>
        )}

        {/* Leading-edge icon puck */}
        <div className="absolute top-1/2 -mt-4" style={{ left: `calc(${puckPct}% - 16px)` }}>
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06]">
            {/* Soft motion streak trailing the icon */}
            {searching && (
              <span className="absolute right-full top-1/2 -mt-px h-px w-6 bg-gradient-to-l from-brand-teal-400/70 to-transparent" />
            )}
            {isFlights ? (
              /* Drift lives on a wrapper so it never fights the svg's own
                 transform (CSS animations override inline transforms). */
              <span className={searching ? 'motion-safe:animate-[pb-drift_2.4s_ease-in-out_infinite]' : 'block'}>
                <Plane
                  strokeWidth={2.2}
                  className={`h-4 w-4 ${failed ? 'text-red-400' : done ? 'text-emerald-500' : 'text-brand-teal-500'}`}
                  style={{
                    // 45° = pointing left→right (brand art); completion adds a
                    // nose-up climb away.
                    transform: done ? 'rotate(58deg) translate(4px, -9px)' : 'rotate(45deg)',
                    transition: 'transform 900ms cubic-bezier(0.16,1,0.3,1), opacity 650ms ease 250ms',
                    opacity: done ? 0 : 1,
                  }}
                />
              </span>
            ) : (
              <span className={searching ? 'motion-safe:animate-[pb-drift_1.7s_ease-in-out_infinite]' : 'block'}>
                <Car
                  strokeWidth={2.2}
                  className={`h-4 w-4 ${failed ? 'text-red-400' : done ? 'text-emerald-500' : 'text-brand-teal-500'}`}
                />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Live status line — reserved space, no layout shift */}
      <div className="mt-2 flex items-center justify-between gap-4">
        <p className={`truncate text-[13px] font-medium ${statusClass}`}>{statusText}</p>
        {searching && (
          <span className="shrink-0 text-xs tabular-nums text-gray-400">{Math.round(pct)}%</span>
        )}
      </div>
    </div>
  );
}

// re-exported for import ergonomics; keeps the old import path stable
export { EASE_OUT };
