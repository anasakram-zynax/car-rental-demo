'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiRequest } from './api/client';
import type { PublicModulesInfo } from '@/features/admin/api/admin-settings';

const Ctx = createContext<PublicModulesInfo | null>(null);

const STALE_TIME_MS = 10 * 60 * 1000; // 10 minutes cache

/**
 * Shared fetch state at module level so EVERY mounted provider instance
 * participates in one fetch cycle. Cached for 5 minutes to prevent
 * API flooding on route changes or window focus.
 */
let sharedModules: PublicModulesInfo | null = null;
let lastFetchedAt = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(m: PublicModulesInfo | null) => void>();

async function loadModules(force = false): Promise<void> {
  if (!force && sharedModules && Date.now() - lastFetchedAt < STALE_TIME_MS) {
    return;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const data = await apiRequest<PublicModulesInfo>('/settings/modules');
      if (data?.flights && data?.hotels) {
        sharedModules = data;
        lastFetchedAt = Date.now();
        listeners.forEach((fn) => fn(sharedModules));
      }
    } catch {
      /* keep last known state */
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function subscribe(listener: (m: PublicModulesInfo | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Server-seeded provider for public module state (names, visibility, order).
 * `initial` comes from the server at request time so the first paint already
 * shows the real configuration — no flash of defaults. Caches for 5 minutes.
 */
export function PublicModulesProvider({
  initial,
  children,
}: {
  initial: PublicModulesInfo | null;
  children: ReactNode;
}) {
  const [modules, setModules] = useState<PublicModulesInfo | null>(
    initial ?? sharedModules,
  );

  useEffect(() => {
    if (initial) {
      if (!sharedModules) sharedModules = initial;
      if (!lastFetchedAt) lastFetchedAt = Date.now();
    }
    setModules(sharedModules ?? initial);
    const unsubscribe = subscribe(setModules);
    void loadModules();
    const timer = setInterval(() => void loadModules(true), STALE_TIME_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [initial]);

  return <Ctx.Provider value={modules}>{children}</Ctx.Provider>;
}

export function useModules(): PublicModulesInfo | null {
  return useContext(Ctx);
}
