"use client";

/**
 * Shared, theme-aware loading skeletons so every admin tab shows the same
 * shimmer treatment instead of ad-hoc animate-pulse blocks.
 */

const bar = "animate-pulse rounded bg-muted";

export function AdminTableSkeleton({
  rows = 6,
  columns = 6,
  className = "",
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={className} aria-busy="true" aria-label="Loading table">
      <div className="flex items-center gap-4 border-b border-border px-4 py-3.5 sm:px-6">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className={`${bar} h-3.5 w-full max-w-24`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-0 sm:px-6"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className={`${bar} h-4 w-full`}
              style={{ maxWidth: c === 0 ? 48 : c === columns - 1 ? 72 : 160 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function AdminCardsSkeleton({
  count = 4,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${className}`}
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5">
          <div className={`${bar} h-4 w-1/2`} />
          <div className={`${bar} mt-3 h-7 w-24`} />
          <div className={`${bar} mt-2 h-3 w-16`} />
        </div>
      ))}
    </div>
  );
}
