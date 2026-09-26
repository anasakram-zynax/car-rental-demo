'use client';
import { useTranslations } from 'next-intl';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import {
  getCustomerBookings,
  getCustomerFlightBookingDetail,
  getCustomerHotelBookingDetail,
  cancelCustomerBooking,
  CUSTOMER_CANCELLABLE_STATUSES,
  type CustomerBookingItem,
  type CustomerBookingDetail,
  type CancelBookingResponse,
} from '@/features/bookings/api/customer-bookings';
import { CustomerBookingCard } from '@/features/bookings/components/CustomerBookingCard';
import { getCustomerInvoiceByBooking } from '@/features/invoices/api/customer-invoices';
import { getCancelEstimate } from '@/features/hotels/api/cancel-estimate';
import type { CancelEstimateResponse } from '@/features/hotels/api/cancel-estimate';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

// ─── Inline SVG Icons ─────────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function AlertTriangle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function HotelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21V3h18v18" /><path d="M3 7h18" /><path d="M3 11h18" /><path d="M3 15h18" /><path d="M7 3v18" /><path d="M11 15h2v6h-2z" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

// ─── Receipt upload (bank-transfer held bookings) ────────────

const RECEIPT_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

function ReceiptUploadBlock({
  bookingId,
  bookingType,
  receiptUrl,
}: {
  bookingId: string;
  bookingType: 'flight' | 'hotel';
  receiptUrl: string | null;
}) {
  const t = useTranslations('Account');
  const toasts = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!RECEIPT_MIMES.includes(file.type)) {
      toasts.error(t('wrongFileType'), t('wrongFileTypeDesc'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toasts.error(t('fileTooLarge'), t('fileTooLargeDesc'));
      return;
    }
    setUploading(true);
    try {
      const { uploadFlightReceipt, uploadHotelReceipt } = await import(
        '@/features/bookings/api/customer-bookings'
      );
      await (bookingType === 'hotel' ? uploadHotelReceipt : uploadFlightReceipt)(
        bookingId,
        file,
      );
      toasts.success(t('receiptUploaded'), t('receiptUploadedDesc'));
      queryClient.invalidateQueries({ queryKey: ['customer', 'booking'] });
      queryClient.invalidateQueries({ queryKey: ['customer', 'bookings'] });
    } catch (err) {
      toasts.error(t('uploadFailed'), err instanceof Error ? err.message : t('uploadFailedDesc'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-xl border border-brand-teal-200 bg-brand-teal-50/50 p-3 dark:border-brand-teal-800 dark:bg-brand-teal-950/20">
      {receiptUrl ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {t('receiptReceivedNote')}
          </p>
          <a
            href={receiptUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 cursor-pointer text-xs font-semibold text-brand-teal hover:underline"
          >
            {t('viewAction')}
          </a>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {t('bankTransferPrompt')}
          </p>
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg bg-brand-teal px-3 py-2 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
          >
            {uploading ? t('uploadingStatus') : t('uploadReceiptAction')}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────

export default function MyBookingsPage() {
  const t = useTranslations('Account');
  const tc = useTranslations('Common');
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toasts = useToast();

  // ── State ──────────────────────────────────────────────
  const [typeFilter, setTypeFilter] = useState<'all' | 'flight' | 'hotel'>('all');
  const [search, setSearch] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<{ id: string; type: 'flight' | 'hotel' } | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState<{ id: string; type: 'flight' | 'hotel' } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelResult, setCancelResult] = useState<CancelBookingResponse | null>(null);
  const [cancelEstimate, setCancelEstimate] = useState<CancelEstimateResponse | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const { decimalsMap } = useCurrencyData();
  const fmtMoney = (amount: number, currency: string) => formatCurrencyWithCode(amount, currency, decimalsMap);

  // ── Bookings Query ─────────────────────────────────────
  const { data: bookings, isPending, refetch } = useQuery<CustomerBookingItem[]>({
    queryKey: ['customer', 'bookings'],
    queryFn: getCustomerBookings,
    enabled: isAuthenticated,
  });

  // ── Booking Detail Query ───────────────────────────────
  const { data: detail, isPending: detailLoading } = useQuery<CustomerBookingDetail | null>({
    queryKey: ['customer', 'booking', selectedBooking?.id],
    queryFn: async () => {
      if (!selectedBooking) return null;
      return selectedBooking.type === 'flight'
        ? getCustomerFlightBookingDetail(selectedBooking.id)
        : getCustomerHotelBookingDetail(selectedBooking.id);
    },
    enabled: !!selectedBooking,
  });

  // ── Cancel Mutation ────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: ({ id, type, reason }: { id: string; type: 'flight' | 'hotel'; reason?: string }) =>
      cancelCustomerBooking(id, type, reason),
    onSuccess: (result) => {
      setCancelResult(result);
      queryClient.invalidateQueries({ queryKey: ['customer', 'bookings'] });
      toasts.success(t('bookingCancelledToast'), t('bookingCancelledToastDesc', { id: result.bookingId.substring(0, 8) }));
    },
    onError: (err: any) => {
      toasts.error(t('cancellationFailedToast'), err?.message ?? t('cancellationFailedDesc'));
    },
  });

  // ── Derived ────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!bookings) return [];
    let list = bookings;
    if (typeFilter !== 'all') {
      list = list.filter((b) => b.type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.id.toLowerCase().includes(q) ||
          b.reference?.toLowerCase().includes(q) ||
          b.description?.toLowerCase().includes(q) ||
          b.hotelName?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [bookings, typeFilter, search]);

  // Statistics
  const stats = useMemo(() => {
    const list = bookings ?? [];
    return {
      total: list.length,
      flights: list.filter((b) => b.type === 'flight').length,
      hotels: list.filter((b) => b.type === 'hotel').length,
      active: list.filter((b) => CUSTOMER_CANCELLABLE_STATUSES.includes(b.status)).length,
    };
  }, [bookings]);

  // ── Redirect if not authenticated ──────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);
  if (!isAuthenticated) return null;

  // Handlers
  const handleView = (id: string, type: 'flight' | 'hotel') => setSelectedBooking({ id, type });

  const handleCancelClick = (id: string, type: 'flight' | 'hotel') => {
    setCancellingBooking({ id, type });
    setCancelReason('');
    setCancelResult(null);
    setCancelEstimate(null);
    setShowCancelModal(true);

    // Fetch fee estimate for hotels (flights have their own fee rules server-side)
    if (type === 'hotel') {
      setEstimateLoading(true);
      getCancelEstimate(id)
        .then(setCancelEstimate)
        .catch(() => setCancelEstimate(null))
        .finally(() => setEstimateLoading(false));
    }
  };

  const handleConfirmCancel = () => {
    if (!cancellingBooking) return;
    cancelMutation.mutate({
      id: cancellingBooking.id,
      type: cancellingBooking.type,
      reason: cancelReason || undefined,
    });
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('myBookings')}</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {t('viewManageDesc')}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
        >
          <RefreshIcon className="size-4" />
          {t('refreshAction')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('totalBookingsStat')}</p>
        </div>
        <div className="rounded-xl border border-brand-teal-200 bg-brand-teal-50/50 p-4 dark:border-brand-teal-900/30 dark:bg-brand-teal-950/10">
          <p className="text-2xl font-bold text-brand-teal dark:text-brand-teal-400">{stats.flights}</p>
          <p className="text-xs text-brand-teal/70 dark:text-brand-teal-400/70">{t('flightsStat')}</p>
        </div>
        <div className="rounded-xl border border-brand-teal-200 bg-brand-teal-50/50 p-4 dark:border-brand-teal-900/30 dark:bg-brand-teal-950/10">
          <p className="text-2xl font-bold text-brand-teal-600 dark:text-brand-teal-400">{stats.hotels}</p>
          <p className="text-xs text-brand-teal-600/70 dark:text-brand-teal-400/70">{t('hotelsStat')}</p>
        </div>
        <div className="rounded-xl border border-brand-teal-200 bg-brand-teal-50/50 p-4 dark:border-brand-teal-900/30 dark:bg-brand-teal-950/10">
          <p className="text-2xl font-bold text-brand-teal dark:text-brand-teal-400">{stats.active}</p>
          <p className="text-xs text-brand-teal/70 dark:text-brand-teal-400/70">{t('activeStat')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'flight', 'hotel'] as const).map((ft) => (
          <button
            key={ft}
            onClick={() => setTypeFilter(ft)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              typeFilter === ft
                ? 'bg-brand-teal text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {ft === 'flight' && <PlaneIcon className="size-3.5" />}
            {ft === 'hotel' && <HotelIcon className="size-3.5" />}
            {ft === 'all' ? t('filterAll') : ft === 'flight' ? t('filterFlights') : t('filterHotels')}
          </button>
        ))}

        <div className="relative ml-auto">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t('searchBookingsPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-40 rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-brand-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
        </div>
      </div>

      {/* Bookings List */}
      <div className="space-y-3">
        {isPending ? (
          // Loading skeleton
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
          ))
        ) : filtered.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-200 py-16 dark:border-gray-700">
            <HistoryIcon className="size-12 text-gray-200 dark:text-gray-700" />
            <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">
              {search || typeFilter !== 'all'
                ? t('noMatchFilters')
                : t('noBookingsYet')}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {search || typeFilter !== 'all'
                ? t('adjustFiltersHint')
                : t('noBookingsHint')}
            </p>
            {!search && typeFilter === 'all' && (
              <button
                onClick={() => router.push('/')}
                className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-teal px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#012830]"
              >
                {t('searchFlightsHotels')}
              </button>
            )}
          </div>
        ) : (
          filtered.map((booking) => (
            <CustomerBookingCard
              key={`${booking.type}-${booking.id}`}
              booking={booking}
              onView={handleView}
              onCancel={handleCancelClick}
            />
          ))
        )}
      </div>

      {/* Booking Detail Modal */}
      {selectedBooking && detail && !detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedBooking(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {detail.type === 'flight' ? <PlaneIcon className="size-5 text-brand-teal" /> : <HotelIcon className="size-5 text-purple-500" />}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">{t('bookingDetailTitle', { type: detail.type })}</h3>
              </div>
              <button onClick={() => setSelectedBooking(null)} className="cursor-pointer rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <CloseIcon className="size-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{t('statusLabel')}</p>
                  <div className="mt-1">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      detail.status === 'booked' || detail.status === 'held' || detail.status === 'confirmed' || detail.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : detail.status === 'pending_payment' || detail.status === 'held_pending_payment' || detail.status === 'pending' || detail.status === 'booking_in_progress'
                        ? 'bg-amber-100 text-amber-700'
                        : detail.status === 'cancelled' || detail.status === 'failed'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {detail.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{t('amountLabel')}</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {detail.amount != null && detail.currency ? fmtMoney(detail.amount, detail.currency) : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{t('providerLabel')}</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{detail.provider ?? '—'}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{t('referenceLabel')}</p>
                  <p className="text-sm font-mono font-medium text-gray-900 dark:text-white">{detail.reference || detail.locatorCode || '—'}</p>
                </div>
              </div>

              {detail.type === 'flight' && detail.offerSnapshot && (
                <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('flightDetailsTitle')}</p>
                  <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                    <p>{t('fromLabel')} {(detail.offerSnapshot as any)?.from || t('notApplicable')}</p>
                    <p>{t('toLabel')} {(detail.offerSnapshot as any)?.to || t('notApplicable')}</p>
                    <p>{t('departureLabel')} {(detail.offerSnapshot as any)?.departureDate ? new Date((detail.offerSnapshot as any).departureDate).toLocaleDateString() : t('notApplicable')}</p>
                  </div>
                </div>
              )}

              {detail.type === 'hotel' && detail.holder && (
                <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('guestDetailsTitle')}</p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{t('holderLabel')} {(detail.holder as any)?.name || t('notApplicable')}</p>
                </div>
              )}

              {/* Timeline */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('timelineTitle')}</p>
                <div className="mt-2 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="mt-1 flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-brand-teal-200 dark:bg-brand-teal-800">
                      <div className="h-1.5 w-1.5 rounded-full bg-brand-teal" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('bookingCreatedEvent')}</p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(detail.createdAt).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  {detail.status === 'cancelled' && (
                    <div className="flex items-start gap-2">
                      <div className="mt-1 flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-error-200 dark:bg-error-800">
                        <div className="h-1.5 w-1.5 rounded-full bg-error-500" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-error-600 dark:text-error-400">{t('cancelledEvent')}</p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(detail.updatedAt).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{t('lastUpdatedLabel')}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {new Date(detail.updatedAt).toLocaleString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>

              {detail.message && (
                <div className="rounded-xl bg-warning-50 p-3 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                  {detail.message}
                </div>
              )}

              {/* Bank-transfer receipt: held bookings wait on admin verification */}
              {((detail.type === 'flight' &&
                ['pending_payment', 'held_pending_payment', 'held'].includes(detail.status)) ||
                (detail.type === 'hotel' &&
                  ['pending_payment', 'booking_in_progress'].includes(detail.status))) && (
                <ReceiptUploadBlock
                  bookingId={detail.id}
                  bookingType={detail.type}
                  receiptUrl={detail.receiptUrl ?? null}
                />
              )}
            </div>

            {/* Invoice + Cancel actions */}
            <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700 space-y-2">
              <button
                onClick={async () => {
                  try {
                    const invoice = await getCustomerInvoiceByBooking(detail.id);
                    router.push(`/invoices/${invoice.id}`);
                  } catch {
                    router.push('/invoices');
                  }
                }}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand-teal-200 bg-white px-4 py-2.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal-50 dark:border-brand-teal-800 dark:bg-gray-800 dark:text-brand-teal-400 dark:hover:bg-brand-teal-950/20"
              >
                <FileTextIcon className="size-4" />
                {t('viewInvoiceAction')}
              </button>
              {CUSTOMER_CANCELLABLE_STATUSES.includes(detail.status) && (
                <button
                  onClick={() => { setSelectedBooking(null); handleCancelClick(detail.id, detail.type); }}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-error-200 bg-white px-4 py-2.5 text-sm font-medium text-error-600 transition-colors hover:bg-error-50 dark:border-error-800 dark:bg-gray-800 dark:text-error-400 dark:hover:bg-error-950/20"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  {t('cancelBookingAction')}
                </button>
              )}
            </div>

            <div className="mt-3">
              <button onClick={() => setSelectedBooking(null)}
                className="w-full cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {tc('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Not found message */}
      {selectedBooking && detail === null && !detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedBooking(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('bookingNotFound')}</p>
            <button onClick={() => setSelectedBooking(null)}
              className="mt-4 w-full cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {tc('close')}
            </button>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && cancellingBooking && !cancelResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!cancelMutation.isPending) { setShowCancelModal(false); setCancellingBooking(null); } }}>
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error-50 dark:bg-error-900/20">
                <AlertTriangle className="size-5 text-error-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('cancelBookingTitle')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('cancelBookingWarning')}
                </p>
              </div>
            </div>

            {/* Fee Estimate (hotel bookings) */}
            {cancellingBooking.type === 'hotel' && (
              <div className="mt-4 space-y-2.5 rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
                {estimateLoading ? (
                  <p className="text-center text-xs text-gray-400 py-2">{t('calculatingFee')}</p>
                ) : cancelEstimate ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {t('policySourceLabel')}
                      </span>
                      <span
                        className={
                          cancelEstimate.policySource === 'live'
                            ? 'inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-950'
                            : cancelEstimate.policySource === 'snapshot'
                              ? 'inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-950'
                              : 'inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700'
                        }
                      >
                        {cancelEstimate.policySource === 'live'
                          ? t('policyLive')
                          : cancelEstimate.policySource === 'snapshot'
                            ? t('policySnapshot')
                            : t('unknownValue')}
                      </span>
                    </div>
                  </>
                ) : null}
                {estimateLoading ? null : cancelEstimate ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t('bookingTotalLabel')}</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {fmtMoney(cancelEstimate.totalAmount, cancelEstimate.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t('cancellationFeeLabel')}</span>
                      <span className="font-medium text-error-600 dark:text-error-400">
                        {cancelEstimate.cancellationFee == null
                          ? t('feeUnknown')
                          : cancelEstimate.cancellationFee > 0
                            ? `-${fmtMoney(cancelEstimate.cancellationFee, cancelEstimate.currency)}`
                            : t('cancellationFree')}
                      </span>
                    </div>
                    {cancelEstimate.policyDescription && (
                      <div className="text-[10px] text-gray-400 italic">{cancelEstimate.policyDescription}</div>
                    )}
                    {cancelEstimate.isFreeCancellation && (
                      <div className="rounded-lg bg-success-50 p-2 text-xs text-success-700 dark:bg-success-900/20 dark:text-success-400">
                        {t('freeCancellationNote')}
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-2 dark:border-gray-700">
                      <div className="flex justify-between text-sm font-bold">
                        <span className="text-gray-900 dark:text-white">{t('estimatedRefundLabel')}</span>
                        <span className={cancelEstimate.refundAmount != null && cancelEstimate.refundAmount > 0 ? 'text-success-600 dark:text-success-400' : 'text-gray-500 dark:text-gray-400'}>
                          {cancelEstimate.refundAmount == null
                            ? t('unknownValue')
                            : fmtMoney(cancelEstimate.refundAmount, cancelEstimate.currency)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {/* Reason */}
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('cancelReasonLabel')}
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('cancelReasonPlaceholder')}
                rows={2}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-600 dark:focus:ring-brand-900/30"
              />
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => { setShowCancelModal(false); setCancellingBooking(null); }}
                disabled={cancelMutation.isPending}
                className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {t('keepBookingAction')}
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={cancelMutation.isPending}
                className="flex-1 cursor-pointer rounded-xl bg-error-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-error-600 disabled:opacity-50"
              >
                {cancelMutation.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {t('processingStatus')}
                  </span>
                ) : (
                  t('confirmCancellationAction')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Result Modal */}
      {cancelResult && (() => {
        // CancelBookingResponse carries no currency of its own — resolve it
        // from the estimate (hotel path) or the booking list entry (flight
        // path, no pre-cancel estimate step) rather than assuming USD.
        const cancelResultCurrency =
          cancelEstimate?.currency ??
          bookings?.find((b) => b.id === cancelResult.bookingId)?.currency ??
          'USD';
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setCancelResult(null); setShowCancelModal(false); setCancellingBooking(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-50 dark:bg-success-900/20">
                <CheckIcon className="size-5 text-success-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('bookingCancelledTitle')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('bookingCancelledWithId', { id: cancelResult.bookingId.substring(0, 8) })}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('statusLabel')}</span>
                <span className="font-medium capitalize text-gray-900 dark:text-white">
                  {cancelResult.status.replace(/_/g, ' ')}
                </span>
              </div>
              {cancelResult.paymentStatus && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('paymentStatusLabel')}</span>
                  <span className="font-medium capitalize text-gray-900 dark:text-white">
                    {cancelResult.paymentStatus.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
              {typeof cancelResult.cancellationFee === 'number' && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('cancellationFeeLabel')}</span>
                  <span className="font-medium text-error-600 dark:text-error-400">
                    {cancelResult.cancellationFee > 0
                      ? `-${fmtMoney(cancelResult.cancellationFee, cancelResultCurrency)}`
                      : t('cancellationFree')}
                  </span>
                </div>
              )}
              {typeof cancelResult.refundAmount === 'number' && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('refundLabel')}</span>
                  <span className="font-medium text-success-600 dark:text-success-400">
                    {fmtMoney(cancelResult.refundAmount, cancelResultCurrency)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-lg bg-brand-teal-50 p-2 text-xs text-brand-teal dark:bg-brand-teal-900/20 dark:text-brand-teal-400">
                <WalletIcon className="size-3.5 shrink-0" />
                <span>
                  {cancelResult.isFreeCancellation === false && typeof cancelResult.cancellationFee === 'number' && cancelResult.cancellationFee > 0
                    ? t('refundWithFeeNote')
                    : t('refundPolicyNote')}
                </span>
              </div>
            </div>

            <button
              onClick={() => { setCancelResult(null); setShowCancelModal(false); setCancellingBooking(null); refetch(); }}
              className="mt-5 w-full cursor-pointer rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#012830]"
            >
              {t('doneAction')}
            </button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
