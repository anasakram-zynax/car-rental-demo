"use client";

import { useCallback, useEffect, useState } from "react";
import type { Updater, VisibilityState } from "@tanstack/react-table";

interface PersistedTableState {
  columnVisibility: VisibilityState;
  pageSize: number;
}

const STORAGE_PREFIX = "travalq:admin:table:";

function loadStored(tableId: string): Partial<PersistedTableState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${tableId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistedTableState>;
    return {
      columnVisibility:
        parsed.columnVisibility && typeof parsed.columnVisibility === "object"
          ? (parsed.columnVisibility as VisibilityState)
          : {},
      pageSize:
        typeof parsed.pageSize === "number" && parsed.pageSize > 0
          ? parsed.pageSize
          : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Persists a TanStack table's column visibility + page size per table id so
 * admins don't re-configure their view on every visit. Hydrates after mount to
 * avoid SSR hydration mismatches; the setter is TanStack-compatible.
 */
export function usePersistentTableState(
  tableId: string,
  defaultPageSize = 20,
) {
  // Lazy initializers read localStorage synchronously (safe on the server via
  // `typeof window` guard in `loadStored`), so state is hydrated on first render
  // without a setState-in-effect. Admin tables render after auth/data load, so
  // there's no server-rendered table HTML to cause a hydration mismatch.
  const [columnVisibility, setColumnVisibilityState] = useState<VisibilityState>(
    () => loadStored(tableId).columnVisibility ?? {},
  );
  const [pageSize, setPageSize] = useState<number>(
    () => loadStored(tableId).pageSize ?? defaultPageSize,
  );

  // Persist on change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        `${STORAGE_PREFIX}${tableId}`,
        JSON.stringify({ columnVisibility, pageSize }),
      );
    } catch {
      // ignore storage errors (private mode / quota)
    }
  }, [tableId, columnVisibility, pageSize]);

  // TanStack-compatible column-visibility setter (accepts value or updater).
  const setColumnVisibility = useCallback((updaterOrValue: Updater<VisibilityState>) => {
    setColumnVisibilityState((prev) =>
      typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue,
    );
  }, []);

  return { columnVisibility, setColumnVisibility, pageSize, setPageSize };
}
