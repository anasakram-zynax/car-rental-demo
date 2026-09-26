"use client";

// Intent-based data prefetch for the admin sidebar — the "table is already
// there when I click" layer.
//
// v2 — production-grade rules (learned the hard way):
//  1. LEAF LINKS ONLY. Never prefetch from a section header — sweeping the
//     mouse across the sidebar must not fire the 4 heaviest endpoints.
//  2. DWELL INTENT. A hover only prefetches after the pointer RESTS ~130ms
//     on the link; drive-by hovers are cancelled. Keyboard focus (deliberate)
//     and click (committed) bypass the dwell.
//  3. SERIALIZED, CAPPED, DEDUPED. Prefetches run one at a time through a
//     small queue — they must never create a burst the server has to queue
//     behind (that is exactly what made tab switches hang in v1). The query
//     cache dedupes repeats while fresh (staleTime).
//  4. The endpoint set is deliberately small: the four table tabs that are
//     painful to wait for. Everything else loads on click.
//
// Keys + params MUST mirror what the target page queries on mount (same key
// shape, same default limit) or the prefetch is wasted. Keep in sync.

import type { QueryFunctionContext } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { apiRequest } from "@/lib/api/client";

const PREFETCH_STALE_TIME = 30_000;
const DWELL_MS = 130;
const MAX_CONCURRENT = 1;

function prefetchJson(key: readonly unknown[], path: string) {
  void queryClient
    .fetchQuery({
      queryKey: key,
      queryFn: ({ signal }: QueryFunctionContext) =>
        apiRequest(path, { signal, auth: true }),
      staleTime: PREFETCH_STALE_TIME,
    })
    .catch(() => {
      /* best-effort; the page refetches on mount if missed */
    });
}

// ── tiny serialized queue ────────────────────────────────────────────────
const queue: Array<() => void> = [];
let running = 0;

function pump() {
  if (running >= MAX_CONCURRENT) return;
  const job = queue.shift();
  if (!job) return;
  running++;
  // yield a tick so a real navigation click always wins the race first
  setTimeout(() => {
    job();
    running--;
    pump();
  }, 0);
}

function enqueue(job: () => void) {
  queue.push(job);
  pump();
}

// dedupe: hrefs currently queued/in-flight this tick batch
const pending = new Set<string>();

function requestPrefetch(href: string) {
  if (pending.has(href)) return;
  const spec = routeSpec(href);
  if (!spec) return;
  // cache-fresh check first: a repeat hover within staleTime must not even
  // enqueue (the cache will serve the page instantly anyway)
  const state = queryClient.getQueryState(spec.key);
  if (state && state.dataUpdatedAt > Date.now() - PREFETCH_STALE_TIME) return;
  pending.add(href);
  enqueue(() => {
    prefetchJson(spec.key, spec.path);
    pending.delete(href);
  });
}

// ── dwell intent ─────────────────────────────────────────────────────────
const dwellTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Hover started — wait for the pointer to rest before firing. */
export function prefetchOnHover(href: string | null | undefined): void {
  if (!href || typeof window === "undefined") return;
  if (dwellTimers.has(href)) return;
  const t = setTimeout(() => {
    dwellTimers.delete(href);
    requestPrefetch(href);
  }, DWELL_MS);
  dwellTimers.set(href, t);
}

/** Pointer left — cancel any pending dwell. */
export function cancelPrefetchHover(href: string | null | undefined): void {
  if (!href) return;
  const t = dwellTimers.get(href);
  if (t) {
    clearTimeout(t);
    dwellTimers.delete(href);
  }
}

/** Committed intent (keyboard focus or click) — no dwell, still queued. */
export function prefetchRouteData(href: string | null | undefined): void {
  if (!href || typeof window === "undefined") return;
  cancelPrefetchHover(href);
  requestPrefetch(href);
}

// ── route → query spec ───────────────────────────────────────────────────

function routeSpec(
  href: string,
): { key: readonly unknown[]; path: string } | null {
  let pathname = "";
  let search = "";
  try {
    const url = new URL(href, window.location.origin);
    pathname = url.pathname;
    search = url.search;
  } catch {
    return null;
  }

  // All/Flights/Hotel Bookings — BookingsTable mounts with page 1, the
  // persisted pageSize (default 20), empty filters.
  if (pathname === "/admin/bookings") {
    const type = bookingsTypeFromPath(search);
    const storedLimit = readPersistedPageSize("admin-bookings", 20);
    const params = new URLSearchParams({ type, page: "1", limit: String(storedLimit) });
    return {
      key: ["admin", "bookings", type, 1, storedLimit, "", "", ""],
      path: `/admin/bookings?${params.toString()}`,
    };
  }

  // Agent Bookings — page 1, pageSize 20, no filters, empty search.
  if (pathname === "/admin/agent-bookings") {
    return {
      key: ["admin", "agent-bookings", 1, 20, "", "", "", "", ""],
      path: "/admin/agent-bookings?page=1&limit=20",
    };
  }

  // Users — plain list query.
  if (pathname === "/admin/users") {
    return { key: ["admin", "users"], path: "/admin/users" };
  }

  // Promo codes — page 1, no filters.
  if (pathname === "/admin/promo-codes") {
    return {
      key: ["admin", "promo-codes", { page: 1, status: "", code: "" }],
      path: "/admin/promo-codes?page=1&limit=20",
    };
  }

  return null;
}

function bookingsTypeFromPath(search: string): "all" | "flights" | "hotels" {
  if (search.includes("tab=flights")) return "flights";
  if (search.includes("tab=hotels")) return "hotels";
  return "all";
}

/** Read the persisted page size the way usePersistentTableState does. */
function readPersistedPageSize(tableId: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(`travalq:admin:table:${tableId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { pageSize?: number };
    return typeof parsed.pageSize === "number" && parsed.pageSize > 0
      ? parsed.pageSize
      : fallback;
  } catch {
    return fallback;
  }
}
