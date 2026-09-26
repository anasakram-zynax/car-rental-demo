import { io, Socket } from "socket.io-client";
import type { NotificationItem } from "./notification-types";

type NotificationEventHandler = (notification: NotificationItem) => void;

export type UnreadCountPayload = {
  total: number;
  critical: number;
  high: number;
  info: number;
};

export type UnreadCountHandler = (counts: UnreadCountPayload) => void;
export type SyncStateHandler = (state: "connected" | "disconnected") => void;

/**
 * Module-level socket singleton.
 *
 * Design:
 * - `socket` — the live Socket.IO client (or null).
 * - `currentHandler` — latest notification callback, updated on every
 *   `connectNotificationSocket` call so the closure never goes stale.
 * - `generation` — monotonically increasing counter. Each new socket gets the
 *   next generation number. Old socket event handlers check this to bail out
 *   if they belong to a superseded connection.
 */
let socket: Socket | null = null;
let currentHandler: NotificationEventHandler | null = null;
let countHandler: UnreadCountHandler | null = null;
let syncHandler: SyncStateHandler | null = null;
let generation = 0;

/* ── helpers ──────────────────────────────────────────────────────── */

/** Fully tear down the current socket: strip listeners, close transport,
 *  and null out module state. Safe to call multiple times. */
function destroySocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  currentHandler = null;
  countHandler = null;
  syncHandler = null;
}

/* ── public API ───────────────────────────────────────────────────── */

/**
 * Connect to the backend Socket.IO notification namespace.
 * Authenticates via httpOnly cookie (withCredentials: true).
 *
 * Returns `{ close, destroy }`:
 * - `close()`  — disconnects and nulls the singleton (allows later reconnect).
 * - `destroy()` — same as close but also strips all listeners so no stale
 *   handlers survive on a leaked Manager.
 *
 * If already connected, just updates the handler reference.
 */
export function connectNotificationSocket(
  backendUrl: string,
  onNotification: NotificationEventHandler,
  handlers?: {
    onUnreadCount?: UnreadCountHandler;
    onSyncState?: SyncStateHandler;
  },
): { close: () => void; destroy: () => void } {
  countHandler = handlers?.onUnreadCount ?? null;
  syncHandler = handlers?.onSyncState ?? null;
  // Already connected — just refresh the handler and return.
  if (socket?.connected) {
    currentHandler = onNotification;
    countHandler = handlers?.onUnreadCount ?? null;
    syncHandler = handlers?.onSyncState ?? null;
    return {
      close: () => {
        socket?.disconnect();
        socket = null;
        currentHandler = null;
      },
      destroy: destroySocket,
    };
  }

  // Tear down any previous socket BEFORE setting the new handler.
  // destroySocket() nulls currentHandler, so the assignment must come after.
  destroySocket();
  currentHandler = onNotification;
  const myGeneration = ++generation;

  socket = io(`${backendUrl}/notifications`, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    reconnectionAttempts: Infinity,
    withCredentials: true,
  });

  /* ── event wiring ─────────────────────────────────────────────── */

  socket.on("connect", () => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[notif-socket] connected", {
        id: socket?.id,
        transport: socket?.io.engine?.transport?.name,
        gen: myGeneration,
      });
    }
    if (myGeneration === generation) syncHandler?.("connected");
    // Ask the backend for anything missed while disconnected (fresh unread
    // counts); the server also pushes counts on its own connect flow.
    socket?.emit("sync");
  });

  socket.on("disconnect", (reason) => {
    if (myGeneration === generation) syncHandler?.("disconnected");
    if (process.env.NODE_ENV !== "production") {
      console.warn("[notif-socket] disconnected", { reason, gen: myGeneration });
    }
    // "io server disconnect" = backend explicitly called client.disconnect().
    // Socket.IO does NOT auto-reconnect for this reason, so we must do it
    // manually. The next connection attempt will carry the latest cookies.
    if (reason === "io server disconnect" && socket) {
      socket.connect();
    }
  });

  socket.on("notification:new", (notification: NotificationItem) => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[notif-socket] notification:new", {
        id: notification.id,
        severity: notification.severity,
        type: notification.type,
        gen: myGeneration,
      });
    }
    // Drop events from a superseded socket (e.g. after logout → login).
    if (myGeneration !== generation) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[notif-socket] dropped stale generation", { myGen: myGeneration, currentGen: generation });
      }
      return;
    }
    if (!currentHandler) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[notif-socket] missing currentHandler — event dropped");
      }
      return;
    }
    currentHandler(notification);
  });

  socket.on("notification:count", (counts: UnreadCountPayload) => {
    if (myGeneration !== generation) return;
    if (
      !counts ||
      typeof counts.total !== "number" ||
      typeof counts.critical !== "number" ||
      typeof counts.high !== "number" ||
      typeof counts.info !== "number"
    ) {
      return;
    }
    countHandler?.(counts);
  });

  socket.on("connect_error", (err) => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[notif-socket] connect_error", {
        message: err.message,
        gen: myGeneration,
      });
    }
    // Socket.IO already handles backoff retry. Nothing extra needed here —
    // the next attempt will pick up the latest cookies automatically.
  });

  /* ── return handles ──────────────────────────────────────────── */

  return {
    close: () => {
      socket?.disconnect();
      socket = null;
      currentHandler = null;
    },
    destroy: destroySocket,
  };
}
