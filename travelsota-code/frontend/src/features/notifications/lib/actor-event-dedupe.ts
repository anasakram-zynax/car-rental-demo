'use client';

/**
 * Actor-event dedupe: when an admin performs an action that ALSO produces a
 * backend live notification (role updated, staff created, booking cancelled,
 * provider toggled…), the page used to fire its own success toast on top of
 * the live one — the "double notification" problem.
 *
 * Strategy (agreed): events the backend emits = live only. The page suppresses
 * its redundant success toast for the action; error toasts ALWAYS show (the
 * backend event never fired on failure, and the actor needs the feedback).
 *
 * Usage on a mutation that triggers a backend event:
 *   const release = suppressDuplicateSuccess('role.updated', roleId);
 *   // ... mutation succeeds, backend emits the live notification ...
 *   release(); // ← call after the API resolves (or in onSuccess)
 *
 * The realtime toaster consults the same registry: a live notification matching
 * an armed suppression is delivered to the bell/cache but NOT re-toasted.
 */

const armed = new Map<string, number>(); // key → expiry timestamp

function keyOf(eventType: string, entityId?: string): string {
  return entityId ? `${eventType}:${entityId}` : `${eventType}:*`;
}

/**
 * Arm suppression for a (eventType, entityId) pair. Returns a release fn —
 * call it when the request completes so stale arms don't linger.
 */
export function suppressDuplicateSuccess(
  eventType: string,
  entityId?: string,
): () => void {
  const key = keyOf(eventType, entityId);
  armed.set(key, Date.now() + 60_000); // 60s ceiling, covers slow sockets

  let released = false;
  return () => {
    if (released) return;
    released = true;
    // Keep the arm alive until expiry — the live notification typically
    // arrives within a second of the API response, and the arm is what
    // suppresses it. Re-arming is idempotent (refreshes the TTL).
    armed.set(key, Date.now() + 60_000);
  };
}

/** True if a live notification for this event/entity was locally armed. */
export function isSuppressed(eventType: string, entityId?: string): boolean {
  const key = keyOf(eventType, entityId);
  const expiry = armed.get(key);
  if (expiry === undefined) {
    // Also match the wildcard arm (entity id unknown at arm time).
    const wildcard = armed.get(keyOf(eventType));
    if (wildcard !== undefined) {
      if (wildcard > Date.now()) return true;
      armed.delete(keyOf(eventType));
    }
    return false;
  }
  if (expiry > Date.now()) return true;
  armed.delete(key);
  return false;
}

/** Clear all armed suppressions (logout / user switch). */
export function resetActorEventDedupe(): void {
  armed.clear();
}
