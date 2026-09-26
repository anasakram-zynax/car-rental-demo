export function InvoiceListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      ))}
    </div>
  );
}

export function InvoiceDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
      <div className="h-64 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      <div className="h-24 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}
