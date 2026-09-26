'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Search,
  RefreshCw,
  X,
  Plane,
  Building2,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import {
  getAdminAgentBookingFeed,
  getAdminCancelEstimate,
  type PaginatedAgentBookingFeed,
  type AdminCancelEstimateResponse,
} from '@/features/admin/api/admin-bookings';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { AdminBookingStatusBadge } from '@/components/admin/shared/admin-badges';
import { CopyButton } from '@/components/admin/shared/CopyButton';
import { DeleteConfirm } from '@/components/admin/shared/DeleteConfirm';
import { deleteBookings } from '@/features/admin/api/admin-deletes';
import AvatarText from '@/components/ui/avatar/AvatarText';
import Pagination from '@/components/common/Pagination';
import { AdminTableSkeleton } from '@/components/admin/tables/AdminTableSkeleton';
import { AgentBookingRowActions } from '@/components/admin/agent-bookings/agent-booking-row-actions';
import { cn } from '@/lib/cn';

// Lazy-load heavyweight modals
const AgentBookingDetailModal = dynamic(
  () => import('@/components/admin/agent-bookings/agent-booking-detail-modal').then((m) => m.AgentBookingDetailModal),
  { ssr: false },
);
const AgentBookingCancelModal = dynamic(
  () => import('@/components/admin/agent-bookings/agent-booking-cancel-modal').then((m) => m.AgentBookingCancelModal),
  { ssr: false },
);

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'booked', label: 'Booked' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All Modules' },
  { value: 'flight', label: 'Flights' },
  { value: 'hotel', label: 'Hotels' },
];

const CANCELLABLE_STATUSES = ['booked', 'confirmed', 'pending', 'ticketed', 'CONFIRMED'];

export default function AdminAgentBookingsPage() {
  const toasts = useToast();
  const queryClient = useQueryClient();

  // ── State ──────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Modals & action state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [cancelEstimate, setCancelEstimate] = useState<AdminCancelEstimateResponse | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Debounce search ────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // ── Data Query ─────────────────────────────────────────
  const { data, isPending, isFetching, refetch } = useQuery<PaginatedAgentBookingFeed>({
    queryKey: [
      'admin',
      'agent-bookings',
      page,
      pageSize,
      statusFilter,
      typeFilter,
      dateFrom,
      dateTo,
      debouncedSearch,
    ],
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: () =>
      getAdminAgentBookingFeed({
        page,
        limit: pageSize,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        fromDate: dateFrom || undefined,
        toDate: dateTo || undefined,
        search: debouncedSearch || undefined,
      }),
  });

  // ── Clear + hard refresh: wipe every filter, reset page, bypass cache.
  // Bare refetch() only re-served the 30s stale cache (Bug-027).
  const clearFilters = useCallback(() => {
    setStatusFilter('');
    setTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setDebouncedSearch('');
    setSelectedIds(new Set());
    setPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    clearFilters();
    void queryClient.invalidateQueries({ queryKey: ['admin', 'agent-bookings'] });
  }, [clearFilters, queryClient]);

  const hasActiveFilters =
    statusFilter !== '' ||
    typeFilter !== '' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    search !== '';

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!data?.items.length) return;
    if (selectedIds.size === data.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.items.map((b) => b.id)));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargets?.length) return;
    setDeleting(true);
    try {
      const deleted = await deleteBookings(deleteTargets);
      toasts.success(
        deleted === 1 ? 'Agent booking deleted' : 'Agent bookings deleted',
        `${deleted} ${deleted === 1 ? 'booking' : 'bookings'} permanently removed.`,
      );
      setDeleteTargets(null);
      setSelectedIds(new Set());
      refetch();
    } catch (err: any) {
      toasts.error('Delete failed', err?.message ?? 'Unable to delete bookings.');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenCancel = (bookingId: string) => {
    setCancellingBookingId(bookingId);
    setCancelEstimate(null);
    setShowCancelModal(true);
    setEstimateLoading(true);
    getAdminCancelEstimate(bookingId)
      .then(setCancelEstimate)
      .catch(() => setCancelEstimate(null))
      .finally(() => setEstimateLoading(false));
  };

  const handleOpenDetail = (bookingId: string) => {
    setDetailBookingId(bookingId);
    setShowDetailModal(true);
  };

  const selectedBooking = data?.items.find((b) => b.id === detailBookingId);
  const isSelectedCancellable = selectedBooking
    ? CANCELLABLE_STATUSES.includes(selectedBooking.status)
    : false;

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Agent Bookings"
        description="Real-time B2B bookings feed with live financials, commissions, wallet ledger, and supplier sync."
        breadcrumbs={[{ label: 'Bookings' }, { label: 'Agent Bookings' }]}
        actions={
          <button
            type="button"
            onClick={() => handleRefresh()}
            disabled={isFetching}
            aria-label="Refresh agent bookings"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-input bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
            Refresh
          </button>
        }
      />

      <div className="rounded-2xl border border-border bg-card shadow-xs">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="size-4.5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Agent Bookings</h3>
              <p className="text-xs text-muted-foreground">
                {isPending ? 'Loading…' : `${total.toLocaleString()} total`}
                {selectedIds.size > 0 && (
                  <span className="ml-1 text-primary">· {selectedIds.size} selected</span>
                )}
                {isFetching && !isPending && (
                  <span className="ml-1.5 inline-block size-1.5 animate-pulse rounded-full bg-primary align-middle" />
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative w-full sm:w-auto sm:min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search ref or agent…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Module Filter */}
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 cursor-pointer rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground outline-none transition-colors hover:bg-accent focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 cursor-pointer rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground outline-none transition-colors hover:bg-accent focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Date Filters */}
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground/60">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                aria-label="To date"
              />
            </div>

            {/* Clear all filters */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => clearFilters()}
                aria-label="Clear all filters"
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" />
                Clear
              </button>
            )}

            {/* Bulk Delete Trigger */}
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setDeleteTargets([...selectedIds])}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-error-500 px-3 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-error-600 active:scale-[0.98]"
              >
                <Trash2 className="size-3.5" />
                Delete ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Table Viewport */}
        <div
          className={cn(
            'admin-table-viewport transition-opacity duration-200',
            isFetching && !isPending && 'opacity-60',
          )}
        >
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={items.length > 0 && selectedIds.size === items.length}
                    onChange={toggleAll}
                    className="size-4 cursor-pointer rounded border-input accent-primary"
                  />
                </th>
                <th className="w-[120px] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Module
                </th>
                <th className="w-[200px] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Agent
                </th>
                <th className="w-[180px] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Route / Passenger
                </th>
                <th className="w-[140px] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Reference
                </th>
                <th className="w-[130px] px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Amount
                </th>
                <th className="w-[130px] px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="w-[120px] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Created
                </th>
                <th className="w-[60px] px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isPending ? (
                <AdminTableSkeleton rows={8} columns={9} shortColumns={[0, 1, 4, 6]} />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2.5">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                        <Users className="size-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">No agent bookings found</p>
                      <p className="text-xs text-muted-foreground">
                        Try clearing or modifying your search and filter parameters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((booking) => {
                  const agentFullName = booking.agent
                    ? [booking.agent.firstName, booking.agent.lastName].filter(Boolean).join(' ') ||
                      booking.agent.email
                    : 'Unknown Agent';
                  const isFlight = booking.type === 'flight';
                  const route =
                    booking.from && booking.to
                      ? `${booking.from} → ${booking.to}`
                      : booking.from || null;
                  const canCancel = CANCELLABLE_STATUSES.includes(booking.status);

                  return (
                    <tr
                      key={booking.id}
                      className={cn(
                        'group transition-colors hover:bg-muted/40',
                        selectedIds.has(booking.id) && 'bg-primary/5',
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          aria-label={`Select booking ${booking.ref ?? booking.id}`}
                          checked={selectedIds.has(booking.id)}
                          onChange={() => toggleRow(booking.id)}
                          className="size-4 cursor-pointer rounded border-input accent-primary"
                        />
                      </td>

                      {/* Module */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-black/5 transition-transform duration-200 group-hover:scale-105 dark:ring-white/10',
                              isFlight
                                ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                                : 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
                            )}
                          >
                            {isFlight ? (
                              <Plane className="size-4" />
                            ) : (
                              <Building2 className="size-4" />
                            )}
                          </span>
                          <span className="text-xs font-semibold capitalize text-foreground">
                            {isFlight ? 'Flights' : 'Hotels'}
                          </span>
                        </div>
                      </td>

                      {/* Agent */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 min-w-0 max-w-[190px]">
                          <AvatarText
                            name={agentFullName}
                            className="!size-7 shrink-0 !text-[10px] ring-1 ring-black/5 dark:ring-white/10"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-foreground" title={agentFullName}>
                              {agentFullName}
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground" title={booking.agent?.email ?? ''}>
                              {booking.agent?.email ?? '—'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Route / Passenger */}
                      <td className="px-4 py-3.5">
                        <div className="min-w-0 max-w-[170px]">
                          {route ? (
                            <p className="truncate text-xs font-semibold text-foreground">
                              {route}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">—</p>
                          )}
                          {booking.passengerName && (
                            <p className="truncate text-[10px] text-muted-foreground" title={booking.passengerName}>
                              {booking.passengerName}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Reference */}
                      <td className="px-4 py-3.5">
                        <div className="min-w-0 max-w-[130px]">
                          {booking.ref ? (
                            <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-medium text-foreground ring-1 ring-transparent transition-all duration-200 hover:ring-primary/30 group-hover:text-foreground">
                              <span className="shrink-0 text-muted-foreground/60">#</span>
                              <span className="truncate">{booking.ref}</span>
                              <CopyButton value={booking.ref} label="Copy booking reference" />
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3.5 text-right">
                        {booking.amount != null ? (
                          <div className="leading-tight">
                            <p className="whitespace-nowrap text-xs font-bold tabular-nums text-foreground">
                              ${booking.amount.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {booking.currency ?? 'USD'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex justify-center">
                          <AdminBookingStatusBadge status={booking.status} />
                        </div>
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3.5">
                        <div className="whitespace-nowrap leading-tight">
                          <p className="text-xs font-medium tabular-nums text-foreground">
                            {new Date(booking.createdAt).toLocaleDateString('en-US', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </p>
                          <p className="text-[10px] tabular-nums text-muted-foreground">
                            {new Date(booking.createdAt).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-center">
                        <AgentBookingRowActions
                          booking={booking}
                          canCancel={canCancel}
                          onView={handleOpenDetail}
                          onCancel={handleOpenCancel}
                          onDelete={(id) => setDeleteTargets([id])}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="border-t border-border px-4 py-3.5 sm:px-6">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTargets && (
        <DeleteConfirm
          open
          count={deleteTargets.length}
          noun="agent booking"
          loading={deleting}
          onCancel={() => setDeleteTargets(null)}
          onConfirm={confirmDelete}
        />
      )}

      {/* Detail & Financial Summary Modal */}
      {showDetailModal && (
        <AgentBookingDetailModal
          bookingId={detailBookingId}
          open={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setDetailBookingId(null);
          }}
          onOpenCancel={handleOpenCancel}
          cancellable={isSelectedCancellable}
        />
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <AgentBookingCancelModal
          bookingId={cancellingBookingId}
          open={showCancelModal}
          estimate={cancelEstimate}
          estimateLoading={estimateLoading}
          onClose={() => {
            setShowCancelModal(false);
            setCancellingBookingId(null);
          }}
        />
      )}
    </div>
  );
}

