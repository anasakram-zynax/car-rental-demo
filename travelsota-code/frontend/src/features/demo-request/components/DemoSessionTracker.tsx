"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getActiveDemoSession,
  recordDemoActivity,
  clearActiveDemoSession,
  heartbeatDemoSession,
  startDemoSession,
  saveActiveDemoSession,
  endDemoSessionBeacon,
  endDemoSession,
  DEMO_SESSION_STARTED_EVENT,
  DEMO_SESSION_END_EVENT,
} from "../api/demo-sessions";
import { isUuid, getVisitorId } from "@/lib/visitor-id";
import { getAccessToken } from "@/lib/auth/storage";
import { DEMO_UI_ENABLED } from "@/lib/flags";
import { usePathname } from "next/navigation";
import DemoIdentifyBanner from "./DemoIdentifyBanner";

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;

type ActiveSessionState = { sessionId: string; role: string; startedAt: number };

/**
 * Mounted once in the root layout (before any login). When a demo session
 * appears (localStorage + `demo-session-started` event fired at sign-in), it
 * heartbeats every 30s while the tab is visible.
 *
 * Session lifecycle (v2):
 * - pagehide → `navigator.sendBeacon('…/sessions/end')` so the session ends
 *   the moment the visitor leaves (fetch/keepalive fallback). The server-side
 *   sweeper (3 min) catches beacons that were lost. Heartbeat gaps > 90s are
 *   never credited, so duration stays honest either way.
 * - VISIBILITY CHANGE: nothing — heartbeats just pause while hidden.
 * - heartbeat failure ("expired"/401): the stored session is cleared, and a
 *   fresh `sessions/start` is fired on the next real navigation so long-lived
 *   demo logins keep tracking across daily JWT expiry.
 * - logout → `endDemoSession` via the shared `DEMO_SESSION_END_EVENT`.
 */
export default function DemoSessionTracker() {
  const [session, setSession] = useState<ActiveSessionState | null>(null);
  const sessionRef = useRef<ActiveSessionState | null>(null);
  const failuresRef = useRef(0);

  const stop = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
    clearActiveDemoSession();
  }, []);

  const begin = useCallback((active: ActiveSessionState) => {
    sessionRef.current = active;
    failuresRef.current = 0;
    setSession(active);
  }, []);
  // Auto-restart: if a demo user leaves their dashboard open for days, the
  // heartbeat "expired"/"ended" path stops tracking — restart immediately
  // so the visitor never silently drops out of analytics.
  const restart = useCallback(() => {
    if (sessionRef.current || document.visibilityState !== "visible") return;
    const visitorId = getVisitorId();
    if (!isUuid(visitorId)) return;
    const token = getAccessToken();
    if (!token) return; // not signed in — nothing to track
    void startDemoSession(visitorId)
      .then((res) => {
        if (res.tracked && res.sessionId) {
          saveActiveDemoSession({
            sessionId: res.sessionId,
            role: "user",
            startedAt: Date.now(),
          });
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!DEMO_UI_ENABLED) return;

    // Defer by a tick: effects must not setState synchronously, and the
    // one-tick delay is invisible (the banner mounts right after anyway).
    const initialTimer = window.setTimeout(() => {
      const existing = getActiveDemoSession();
      if (existing) begin(existing);
    }, 0);

    const onStarted = () => {
      const active = getActiveDemoSession();
      if (active) begin(active);
    };
    window.addEventListener(DEMO_SESSION_STARTED_EVENT, onStarted);

    const onEndRequest = () => {
      const current = sessionRef.current;
      if (!current) return;
      void endDemoSession(current.sessionId);
      stop();
    };
    window.addEventListener(DEMO_SESSION_END_EVENT, onEndRequest);

    // End the session the moment the visitor leaves the page.
    const sendEndBeacon = () => {
      const current = sessionRef.current;
      if (!current) return;
      const queued = endDemoSessionBeacon(current.sessionId);
      if (!queued) void endDemoSession(current.sessionId);
    };
    window.addEventListener("pagehide", sendEndBeacon);
    document.addEventListener("freeze", sendEndBeacon); // mobile tab discards

    const timer = window.setInterval(async () => {
      const current = sessionRef.current;
      if (!current || document.visibilityState !== "visible") return;
      try {
        const res = await heartbeatDemoSession(current.sessionId);
        if (!res.ok) {
          // "ended" (sweeper closed it after a long hidden period) or
          // "expired" (24h cap) — drop the local session and start a fresh
          // one right away so the live visit keeps being tracked.
          stop();
          restart();
        } else {
          failuresRef.current = 0;
        }
      } catch {
        failuresRef.current += 1;
        // E.g. user logged out → heartbeats 401 forever. Give up quietly.
        if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) stop();
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      window.removeEventListener(DEMO_SESSION_STARTED_EVENT, onStarted);
      window.removeEventListener(DEMO_SESSION_END_EVENT, onEndRequest);
      window.removeEventListener("pagehide", sendEndBeacon);
      document.removeEventListener("freeze", sendEndBeacon);
    };
  }, [begin, stop, restart]);


  useEffect(() => {
    if (!DEMO_UI_ENABLED) return;
    document.addEventListener("visibilitychange", restart);
    return () => document.removeEventListener("visibilitychange", restart);
  }, [restart]);

  const pathname = usePathname();
  // ── Page-view capture: every route the visitor opens lands in their
  // session's activity feed (which tab did they open?). Fire-and-forget —
  // analytics must never break or delay navigation.
  useEffect(() => {
    const current = sessionRef.current;
    if (!current || !pathname) return;
    void recordDemoActivity(current.sessionId, pathname).catch(
      () => undefined,
    );
  }, [pathname, session?.sessionId]);
  // Lead capture is for public demo browsing only - never inside the
  // authenticated admin/agent dashboards where it covers real work.
  const inDashboard = /^\/(admin|agent)(\/|$)/.test(pathname || "/");
  if (!session || inDashboard) return null;
  return <DemoIdentifyBanner />;
}
