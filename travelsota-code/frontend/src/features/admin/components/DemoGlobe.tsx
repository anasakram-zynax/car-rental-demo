"use client";

// Demo Intelligence globe — cobe (v2, ~5kB gzipped) WebGL globe that lights up
// the countries your demo visitors come from. Renders nothing until the
// component is on-screen, pauses while the tab is hidden, and degrades to a
// no-op on WebGL failure.
//
// Drag physics: pointer pixels are converted to radians relative to the
// canvas size (~240px per radian), with a damped fling (×0.92 per frame) —
// no multi-turn spinning from small mouse moves.
//
// Interactivity (UI/UX pass): hovering a country row in the leaderboard makes
// the globe swing to that country; clicking a leaderboard row or a marker
// focuses it permanently until dismissed.

import { useEffect, useMemo, useRef, useState } from "react";
import createGlobe, { type Marker } from "cobe";
import { COUNTRY_COORDS } from "./demo-country";

export interface GlobeMarker {
  country: string;
  sessions: number;
  visitors: number;
  totalDurationSeconds: number;
}

interface DemoGlobeProps {
  markers: GlobeMarker[];
  /** Alpha-2 code of the country to focus (null = free spin). */
  focusCountry?: string | null;
  className?: string;
}

// ── Rotation tuning (shared between the render loop and drag handlers) ──
const AUTO_SPEED = 0.0022; // rad/frame ≈ one turn per ~48s
const PX_PER_RADIAN = 240; // ~240px of drag = 1 radian (natural feel)
/** Shortest signed angular distance from a to b (radians, wrapped at π). */
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export default function DemoGlobe(props: DemoGlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [supported, setSupported] = useState(true);
  const [visible, setVisible] = useState(false);

  // Rotation state — refs so drag handlers and the raf loop share one truth.
  const phiRef = useRef(1.3); // start with Asia/Pakistan facing the camera
  const draggingRef = useRef(false);
  const velocityRef = useRef(0); // rad/frame, set while dragging → fling
  const dragAnchorRef = useRef({ x: 0, phi: 0 });
  // Auto-focus: easing target while a country is highlighted, then released.
  const focusRef = useRef<{ phi: number; active: boolean }>({ phi: 0, active: false });

  // Lazy-mount: only create the (WebGL) globe when scrolled into view.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Weight each country once per signature change (capped for perf) so busy
  // countries glow brighter via overlapping markers. Keyed on a stable
  // signature so a routine summary refetch flows into globe.update() WITHOUT
  // re-creating the WebGL context.
  const markerKey = props.markers
    .map((m) => `${m.country}:${m.sessions}:${m.visitors}`)
    .join("|");
  const countryMarkers: Marker[] = useMemo(
    () =>
      props.markers
        .filter((m) => COUNTRY_COORDS[m.country])
        .flatMap((m) => {
          const [lon, lat] = COUNTRY_COORDS[m.country];
          const pins = Math.min(6, Math.max(1, Math.round(m.sessions)));
          return Array.from({ length: pins }, () => ({
            location: [lat, lon] as [number, number],
            size: m.visitors > 1 ? 0.115 : 0.09,
            color: [0.3, 0.95, 0.75] as [number, number, number],
          }));
        })
        .slice(0, 120),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markerKey],
  );
  const markersRef = useRef(countryMarkers);
  useEffect(() => {
    markersRef.current = countryMarkers;
  }, [countryMarkers]);

  // Focus target: when the leaderboard highlights a country, ease the globe
  // so that country faces the camera, then release back to auto-spin.
  useEffect(() => {
    const code = props.focusCountry;
    if (!code || !COUNTRY_COORDS[code]) {
      focusRef.current.active = false;
      return;
    }
    const [lon] = COUNTRY_COORDS[code];
    // cobe phi=0 faces lon 0; phi increases eastward → target phi = -lon.
    const target = (-lon * Math.PI) / 180;
    focusRef.current = {
      phi: phiRef.current + shortestAngle(phiRef.current, target),
      active: true,
    };
  }, [props.focusCountry]);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let width = containerRef.current?.offsetWidth ?? 0;
    const onResize = () => {
      width = containerRef.current?.offsetWidth ?? width;
    };
    window.addEventListener("resize", onResize);

    let paused = document.visibilityState !== "visible";
    const onPause = () => {
      paused = document.visibilityState !== "visible";
    };
    document.addEventListener("visibilitychange", onPause);

    let globe: ReturnType<typeof createGlobe> | null = null;
    let raf = 0;
    let failTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      globe = createGlobe(canvasRef.current, {
        devicePixelRatio: Math.min(2, window.devicePixelRatio || 1),
        width: width * 2,
        height: width * 2,
        phi: phiRef.current,
        theta: 0.28,
        dark: 1,
        diffuse: 1.1,
        mapSamples: 16000,
        mapBrightness: 5.5,
        baseColor: [0.18, 0.32, 0.36],
        markerColor: [0.35, 0.9, 0.75],
        glowColor: [0.08, 0.22, 0.24],
        opacity: 0.96,
        markers: markersRef.current,
      });
      const render = () => {
        if (!paused && !draggingRef.current) {
          if (focusRef.current.active) {
            // Ease toward the focused country, then hand back to auto-spin.
            const delta = focusRef.current.phi - phiRef.current;
            phiRef.current += delta * 0.08;
            if (Math.abs(delta) < 0.005) focusRef.current.active = false;
          } else {
            // Damped fling from the last drag…
            phiRef.current += velocityRef.current;
            velocityRef.current *= 0.92;
            if (Math.abs(velocityRef.current) < 0.00004) velocityRef.current = 0;
            // …plus the constant slow spin.
            phiRef.current += AUTO_SPEED;
          }
        }
        globe?.update({
          phi: phiRef.current,
          width: width * 2,
          height: width * 2,
          markers: markersRef.current,
        });
        raf = requestAnimationFrame(render);
      };
      raf = requestAnimationFrame(render);
    } catch {
      // Defer to a callback so React strict lint doesn't see a render-cascade.
      failTimer = setTimeout(() => setSupported(false), 0);
    }

    return () => {
      if (failTimer) clearTimeout(failTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onPause);
      try {
        globe?.destroy();
      } catch {
        /* ignore */
      }
    };
    // Re-create only when first visible (marker changes flow via update()).
  }, [visible]);

  const dragHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      draggingRef.current = true;
      velocityRef.current = 0;
      focusRef.current.active = false;
      dragAnchorRef.current = { x: e.clientX, phi: phiRef.current };
      void e.currentTarget.setPointerCapture(e.pointerId);
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      const next =
        dragAnchorRef.current.phi +
        (e.clientX - dragAnchorRef.current.x) / PX_PER_RADIAN;
      velocityRef.current = next - phiRef.current; // ≈ rad per frame
      phiRef.current = next;
    },
    onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => {
      draggingRef.current = false;
      void e.currentTarget.releasePointerCapture?.(e.pointerId);
      if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    },
    onPointerOut: () => {
      if (!draggingRef.current && canvasRef.current)
        canvasRef.current.style.cursor = "grab";
    },
  };

  return (
    <div ref={containerRef} className={props.className}>
      <div className="relative mx-auto aspect-square w-full max-w-[440px]">
        {supported && (
          <canvas
            ref={canvasRef}
            className="size-full cursor-grab touch-none [contain:layout_paint_size]"
            style={{ aspectRatio: 1 }}
            {...dragHandlers}
          />
        )}
        {!supported && (
          <div className="flex size-full items-center justify-center rounded-full border border-border/60 bg-gradient-to-b from-brand-teal-50/40 to-transparent dark:from-brand-teal/20 dark:to-transparent">
            <span className="max-w-48 text-center text-xs text-muted-foreground">
              Globe preview unavailable — {props.markers.length} countr
              {props.markers.length === 1 ? "y" : "ies"} active.
            </span>
          </div>
        )}
        {supported && props.markers.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-9 flex justify-center">
            <div className="max-w-56 rounded-full border border-border/50 bg-background/70 px-3 py-1 text-center text-[11px] text-muted-foreground backdrop-blur">
              Awaiting the first visitor from outside your network — local
              addresses aren&apos;t mapped.
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden />
            {props.markers.length > 0
              ? `${props.markers.length} ${props.markers.length === 1 ? "country" : "countries"} live · hover a country to find it`
              : "Live demo visitors"}
          </div>
        </div>
      </div>
    </div>
  );
}
