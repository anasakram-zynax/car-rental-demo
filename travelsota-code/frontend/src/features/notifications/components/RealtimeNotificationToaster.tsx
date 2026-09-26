'use client';
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/components/admin/permission/usePermissions";
import { PermissionCode } from "@/lib/permissions";
import { getPublicEnv } from "@/lib/env/env";
import { connectNotificationSocket } from "../api/notification-socket";
import type { NotificationBootstrap } from "../api/admin-notifications";
import { useNotificationBootstrap } from "../hooks";
import {
  pushNotificationToast,
  seedSeenNotifications,
  resetNotificationToastBridge,
} from "../lib/notification-toast-bridge";
import { resetActorEventDedupe } from "../lib/actor-event-dedupe";
import LiveNotificationStack from "./LiveNotificationStack";
import type { NotificationItem, NotificationListResult, UnreadCountResult } from "../api/notification-types";

const BOOTSTRAP_TOAST_WINDOW_MS = 2 * 60 * 1000; // 2 minutes (reduce ghost toasts on login)
/** After the last event of a burst, wait this long then re-sync the count. */
const COUNT_RESYNC_DEBOUNCE_MS = 1_500;

/**
 * Root-level component that connects via Socket.IO for realtime notifications
 * and routes them through the LIVE notification stack bridge (bottom-left);
 * normal action toasts are unrelated (sonner-backed, top-right).
 *
 * - Permission-gated: only connects when user has `notifications:read`.
 * - Bootstrap: on fresh load, seeds dedup state and shows recent unread
 *   critical/high as live cards (no info spam on login).
 * - Instant UI: optimistically updates query cache (no refetch on realtime),
 *   then debounce-resyncs the unread count after each burst settles so the
 *   optimistic total converges to server truth.
 * - Server pushes: `notification:count` (coalesced backend-side) replaces the
 *   cached counts with server truth; `sync` on reconnect catches up anything
 *   missed while disconnected.
 * - Dedup: shared with the bridge so bootstrap + socket never double-show.
 * - Tab title: shows `(N)` unread prefix so admins working in other tabs
 *   still notice new activity.
 */
export default function RealtimeNotificationToaster() {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const { isAuthenticated, isAuthLoading, user } = useAuth();
  const { hasPermission } = usePermissions();
  const hasNotifRead = hasPermission(PermissionCode.NOTIFICATIONS_READ);
  const [reconnecting, setReconnecting] = useState(false);

  const socketRef = useRef<{ close: () => void; destroy: () => void } | null>(null);
  const bootstrappedRef = useRef(false);
  const resyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Bootstrap: seed dedup + show recent unread critical/high on login ──
  // Reads the shared header bootstrap (ONE request) instead of two direct
  // fetches — this effect previously fanned out per mount.
  const { data: bootstrapData } = useNotificationBootstrap();
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !hasNotifRead || bootstrappedRef.current) return;
    if (!bootstrapData) return;
    bootstrappedRef.current = true;

    const cutoff = Date.now() - BOOTSTRAP_TOAST_WINDOW_MS;

    const items: NotificationItem[] = [
      ...(bootstrapData.critical ?? []),
      ...((bootstrapData.high as { data?: NotificationItem[] })?.data ?? []),
    ];

      // Dedup + prefer newest-first ordering for the lead card.
      const unique = new Map<string, NotificationItem>();
      for (const n of items) if (!unique.has(n.id)) unique.set(n.id, n);
      const ordered = [...unique.values()].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      // Show recent items first (push remembers each id it displays), then
      // seed the rest so a socket replay of anything processed here can't
      // produce a duplicate. (Seeding BEFORE pushing would dedupe the
      // bootstrap display against itself and show nothing.)
      const shown = new Set<string>();
      for (const n of ordered) {
        const ts = new Date(n.createdAt).getTime();
        if (ts >= cutoff && pushNotificationToast(n)) shown.add(n.id);
      }
      seedSeenNotifications(
        ordered.map((n) => n.id).filter((id) => !shown.has(id)),
      );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isAuthLoading, hasNotifRead, bootstrapData]);

  // ── Debounced count re-sync (one request per burst, not per event) ──
  const scheduleCountResync = () => {
    if (resyncTimerRef.current) clearTimeout(resyncTimerRef.current);
    resyncTimerRef.current = setTimeout(() => {
      resyncTimerRef.current = null;
      // Default refetchType 'active' — refetches the mounted bootstrap once.
      queryClient.invalidateQueries({ queryKey: ['notifications', 'bootstrap'] });
    }, COUNT_RESYNC_DEBOUNCE_MS);
  };

  // ── Stable handler ref — prevents socket reconnection when handler changes ──
  const handleNotificationRef = useRef<(n: NotificationItem) => void>(() => {});
  handleNotificationRef.current = (notification: NotificationItem) => {
    // Optimistic cache update — instant UI, no refetch needed.
    // Never decrement: only increment counts on new notifications.
    queryClient.setQueryData<UnreadCountResult>(
      ['notifications', 'unread-count'],
      (old) => {
        if (!old) return old;
        return {
          ...old,
          total: old.total + 1,
          critical: notification.severity === 'critical' ? old.critical + 1 : old.critical,
          high: notification.severity === 'high' ? old.high + 1 : old.high,
          info: notification.severity === 'info' ? old.info + 1 : old.info,
        };
      },
    );

    queryClient.setQueriesData<NotificationListResult>(
      { queryKey: ['notifications'], exact: false },
      (old) => {
        if (!old || !('data' in old)) return old;
        if (old.data.some((n) => n.id === notification.id)) return old;
        return { ...old, data: [notification, ...old.data], total: old.total + 1 };
      },
    );

    // Unified live pipeline (dedup + burst grouping inside).
    pushNotificationToast(notification);

    // Converge the optimistic count to server truth after the burst settles.
    scheduleCountResync();
  };

  // ── Stable handlers for count pushes and connection state ──
  const handlersRef = useRef<{
    onUnreadCount?: (counts: UnreadCountResult) => void;
    onSyncState?: (state: "connected" | "disconnected") => void;
  }>({});
  handlersRef.current = {
    onUnreadCount: (counts) => {
      // Server truth — replaces the optimistic counter entirely.
      queryClient.setQueryData<UnreadCountResult>(
        ['notifications', 'unread-count'],
        counts,
      );
      queryClient.setQueryData<NotificationBootstrap>(
        ['notifications', 'bootstrap'],
        (old) => (old ? { ...old, unread: counts } : old),
      );
    },
    onSyncState: (state) => {
      setReconnecting(state === "disconnected");
      if (state === "connected") {
        // Catch-up after a drop: refetch the counts and any mounted feed so
        // events missed while disconnected converge immediately.
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
      }
    },
  };

  // Clear any pending re-sync on unmount.
  useEffect(() => {
    return () => {
      if (resyncTimerRef.current) clearTimeout(resyncTimerRef.current);
    };
  }, []);

  // ── Tab-title unread counter ──
  const countsCache = queryClient.getQueryData<NotificationBootstrap>([
    'notifications',
    'bootstrap',
  ]);
  const unreadTotal = countsCache?.unread.total ?? 0;
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const base = document.title.replace(/^\(\d+[\+]?\)\s*/, '');
    if (unreadTotal > 0) {
      document.title = `(${unreadTotal > 99 ? '99+' : unreadTotal}) ${base}`;
    } else {
      document.title = base;
    }
  }, [unreadTotal, pathname]);

  // ── Socket.IO realtime connection ──
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !hasNotifRead || !user?.id) {
      socketRef.current?.destroy();
      socketRef.current = null;
      resetNotificationToastBridge();
      resetActorEventDedupe();
      setReconnecting(false);
      return;
    }

    if (socketRef.current) return;

    const { NEXT_PUBLIC_API_BASE_URL } = getPublicEnv();
    const backendUrl = NEXT_PUBLIC_API_BASE_URL.replace('/api/v1', '');

    socketRef.current = connectNotificationSocket(
      backendUrl,
      (notification) => handleNotificationRef.current(notification),
      {
        onUnreadCount: (counts) => handlersRef.current.onUnreadCount?.(counts),
        onSyncState: (state) => handlersRef.current.onSyncState?.(state),
      },
    );

    return () => {
      socketRef.current?.destroy();
      socketRef.current = null;
    };
  // Only reconnect on auth/permission changes, NOT on handler changes
  }, [isAuthenticated, isAuthLoading, hasNotifRead, user?.id]);

  // Render the LIVE stack only for permitted, authenticated users —
  // everyone else sees normal action toasts only.
  if (!isAuthenticated || isAuthLoading || !hasNotifRead) return null;
  return <LiveNotificationStack reconnecting={reconnecting} />;
}
