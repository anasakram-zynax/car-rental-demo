"use client";

// Shared skeletons for the admin dashboard widgets. Each skeleton mirrors the
// real widget's footprint (card frame + header + content shape) so the page
// doesn't shift when data arrives. Rendered while queries/deferred steps load
// instead of "NaN", "…" or spinner text.

const bar = "animate-pulse rounded bg-muted";

function SkeletonCardFrame({
  titleWidth = "w-28",
  children,
  className = "",
  contentClassName = "px-6 pb-6",
}: {
  titleWidth?: string;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-card shadow-sm ${className}`}
      aria-busy="true"
      role="status"
      aria-label="Loading widget"
    >
      <div className="flex items-start justify-between p-6 pb-0">
        <div className="space-y-2">
          <div className={`${bar} h-4 ${titleWidth}`} />
          <div className={`${bar} h-3 w-20`} />
        </div>
        <div className={`${bar} h-8 w-8 rounded-lg`} />
      </div>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

/** KPI stat card (matches DashboardOverviewCardV2 footprint). */
export function KpiCardSkeleton() {
  return (
    <div
      className="flex flex-col justify-between rounded-xl border border-border bg-card shadow-sm"
      aria-busy="true"
      role="status"
      aria-label="Loading stat"
    >
      <div className="flex items-center justify-between p-5">
        <div className="flex items-center gap-x-2">
          <div className={`${bar} size-10 rounded-lg`} />
          <div className="space-y-1.5">
            <div className={`${bar} h-3 w-16`} />
          </div>
        </div>
        <div className={`${bar} h-8 w-8 rounded-lg`} />
      </div>
      <div className="space-y-1.5 px-5 pb-5">
        <div className={`${bar} h-3 w-24`} />
        <div className={`${bar} h-7 w-28`} />
      </div>
    </div>
  );
}

/** Bookings trend card (summary row + 300px bar chart). */
export function BookingsTrendSkeleton() {
  return (
    <SkeletonCardFrame titleWidth="w-32" contentClassName="flex flex-col gap-y-4 px-6 pb-6">
      <div className="grid grid-cols-3 justify-items-center gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className={`${bar} h-8 w-14`} />
            <div className={`${bar} h-3 w-20`} />
          </div>
        ))}
      </div>
      <div className="flex h-[280px] items-end gap-2">
        {[38, 62, 45, 80, 55, 70, 42, 66, 50, 74, 58, 46].map((h, i) => (
          <div key={i} className={`${bar} flex-1`} style={{ height: `${h}%` }} />
        ))}
      </div>
    </SkeletonCardFrame>
  );
}

/** Revenue by source card (headline + stacked bar + 2 legend rows). */
export function RevenueBySourceSkeleton() {
  return (
    <SkeletonCardFrame titleWidth="w-40">
      <div className="pb-1">
        <div className={`${bar} h-8 w-32`} />
      </div>
      <div className={`${bar} h-9 w-full rounded-lg`} />
      <div className="space-y-2 pt-1">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className={`${bar} size-2.5 rounded-sm`} />
              <div className={`${bar} h-4 w-16`} />
            </div>
            <div className="flex items-center gap-3">
              <div className={`${bar} h-4 w-20`} />
              <div className={`${bar} h-6 w-14 rounded-md`} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonCardFrame>
  );
}

/** Customer insights card (4 icon tiles). */
export function CustomerInsightsSkeleton() {
  return (
    <SkeletonCardFrame titleWidth="w-36" contentClassName="px-4 pb-4 sm:px-6 sm:pb-6">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex items-center gap-2">
            <div className={`${bar} size-12 shrink-0 rounded-lg`} />
            <div className="space-y-1.5">
              <div className={`${bar} h-3 w-20`} />
              <div className={`${bar} h-6 w-12`} />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonCardFrame>
  );
}

/** Payment status card (radial chart). */
export function PaymentStatusSkeleton() {
  return (
    <SkeletonCardFrame titleWidth="w-28">
      <div className="flex min-h-56 items-center justify-center">
        <div className={`${bar} size-44 rounded-full`} />
      </div>
    </SkeletonCardFrame>
  );
}

/** Sales trend card (4 summary stats + 300px bar chart). */
export function SalesTrendSkeleton() {
  return (
    <SkeletonCardFrame titleWidth="w-24" contentClassName="flex flex-col gap-y-5 px-6 pb-6">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:flex-row sm:gap-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className={`${bar} h-3 w-20`} />
            <div className={`${bar} h-7 w-24`} />
          </div>
        ))}
      </div>
      <div className="flex h-[300px] items-end gap-2">
        {[50, 72, 40, 84, 60, 48, 78, 55, 66, 44, 70, 58].map((h, i) => (
          <div key={i} className={`${bar} flex-1 rounded-t-md`} style={{ height: `${h}%` }} />
        ))}
      </div>
    </SkeletonCardFrame>
  );
}

/** Top destinations card (5 ranked rows). */
export function TopDestinationsSkeleton() {
  return (
    <SkeletonCardFrame titleWidth="w-36">
      <ul className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className={`${bar} size-10 shrink-0 rounded-md`} />
              <div className="min-w-0 space-y-1.5">
                <div className={`${bar} h-4 w-36`} />
                <div className={`${bar} h-3 w-24`} />
                <div className={`${bar} h-1.5 w-32 rounded-full`} />
              </div>
            </div>
            <div className="shrink-0 space-y-1.5 text-right">
              <div className={`${bar} ml-auto h-4 w-16`} />
              <div className={`${bar} ml-auto h-3 w-12`} />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonCardFrame>
  );
}

/** Recent bookings table card (toolbar + rows + pagination). */
export function BookingsTableSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      aria-busy="true"
      role="status"
      aria-label="Loading bookings"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
        <div className="space-y-2">
          <div className={`${bar} h-5 w-36`} />
          <div className={`${bar} h-3 w-24`} />
        </div>
        <div className="flex items-center gap-2">
          <div className={`${bar} h-9 w-20 rounded-xl`} />
          <div className={`${bar} h-9 w-28 rounded-xl`} />
        </div>
      </div>
      <div className="flex items-center gap-4 border-t border-border px-6 py-3.5">
        {["40px", "110px", "90px", "140px", "80px", "120px"].map((w, i) => (
          <div key={i} className={`${bar} hidden h-3 sm:block`} style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: 8 }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-t border-border/60 px-6 py-3.5"
        >
          {["40px", "110px", "90px", "140px", "80px", "120px"].map((w, c) => (
            <div
              key={c}
              className={`${bar} hidden h-4 sm:block`}
              style={{ width: w }}
            />
          ))}
        </div>
      ))}
      <div className="border-t border-border px-6 py-3">
        <div className="flex items-center justify-between">
          <div className={`${bar} h-4 w-40`} />
          <div className="flex items-center gap-1.5">
            <div className={`${bar} h-8 w-8 rounded-md`} />
            <div className={`${bar} h-8 w-8 rounded-md`} />
            <div className={`${bar} h-8 w-8 rounded-md`} />
          </div>
        </div>
      </div>
    </div>
  );
}
