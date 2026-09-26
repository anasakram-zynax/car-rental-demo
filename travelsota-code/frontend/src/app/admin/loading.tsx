export default function AdminLoading() {
  return (
    <div className="grid gap-4 md:grid-cols-2 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-full">
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      </div>

      {/* Stat cards */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={`stat-${i}`}
          className="rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-7 w-16 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      ))}

      {/* Chart skeletons */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={`chart-${i}`}
          className="rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-5 w-36 animate-pulse rounded bg-muted" />
              <div className="h-3 w-48 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
          </div>
          <div className="mt-6 h-48 animate-pulse rounded-lg bg-muted/50" />
        </div>
      ))}

      {/* Table skeleton */}
      <div className="rounded-xl border border-border bg-card shadow-sm md:col-span-full">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="space-y-1">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="px-6 py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`row-${i}`}
              className="flex items-center gap-4 border-b border-border/60 py-3 last:border-0"
            >
              <div className="h-4 w-4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-4 w-10 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
