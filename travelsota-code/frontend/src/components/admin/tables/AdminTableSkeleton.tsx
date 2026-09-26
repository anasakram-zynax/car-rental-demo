"use client";

// Shared admin-table loading skeleton. Renders `rows` placeholder rows with
// shimmering bars matching the admin-tables.css `admin-shimmer` keyframes.
// Replaces the per-page hand-rolled `animate-pulse` divs so every admin table
// has a consistent, calm loading state (no spinners, no layout jumps).

interface AdminTableSkeletonProps {
  rows?: number;
  /** Column count (including any action/checkbox columns). */
  columns?: number;
  /** Which column indexes render a short bar (status/badge-like columns). */
  shortColumns?: number[];
}

export function AdminTableSkeleton({
  rows = 8,
  columns = 6,
  shortColumns = [],
}: AdminTableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c}>
              <div
                className="admin-table-skeleton h-4 rounded"
                style={{ maxWidth: shortColumns.includes(c) ? 84 : 160 }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
