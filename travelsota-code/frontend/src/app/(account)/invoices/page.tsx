'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useInvoices } from '@/features/invoices/hooks/useInvoices';
import { InvoiceCard } from '@/components/invoices/InvoiceCard';
import { InvoiceListSkeleton } from '@/components/invoices/InvoiceSkeleton';
import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge';

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function InvoiceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

export default function InvoicesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const { data, isPending } = useInvoices({ page, limit: 20, status: statusFilter || undefined, q: search || undefined });

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    return data.items;
  }, [data]);

  const stats = useMemo(() => {
    const items = data?.items ?? [];
    return {
      total: data?.total ?? 0,
      generated: items.filter((i) => i.status === 'generated').length,
      sent: items.filter((i) => i.status === 'sent').length,
      viewed: items.filter((i) => i.status === 'viewed').length,
    };
  }, [data]);

  const handleView = (id: string) => router.push(`/invoices/${id}`);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">My Invoices</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            View and download your invoices for past bookings
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Invoices</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/30 dark:bg-amber-950/10">
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.generated}</p>
          <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Generated</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/30 dark:bg-blue-950/10">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.sent}</p>
          <p className="text-xs text-blue-600/70 dark:text-blue-400/70">Sent</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/10">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.viewed}</p>
          <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Viewed</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {['', 'generated', 'sent', 'viewed', 'paid', 'refunded', 'void'].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`inline-flex cursor-pointer items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              statusFilter === s
                ? 'bg-brand-teal text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {s ? <InvoiceStatusBadge status={s} /> : 'All'}
          </button>
        ))}

        <div className="relative ml-auto">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search invoices…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-40 rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {isPending ? (
          <InvoiceListSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-200 py-16 dark:border-gray-700">
            <InvoiceIcon className="size-12 text-gray-200 dark:text-gray-700" />
            <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">
              No invoices found.
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {search || statusFilter ? 'Try adjusting your filters.' : 'Invoices will appear here after bookings are completed.'}
            </p>
          </div>
        ) : (
          filtered.map((inv) => <InvoiceCard key={inv.id} invoice={inv} onView={handleView} />)
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
