'use client';

import { StatusBadge } from '@/components/ui/badge';
import type { CustomerBookingItem } from '../api/customer-bookings';
import { CUSTOMER_CANCELLABLE_STATUSES } from '../api/customer-bookings';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

// ─── Inline SVG Icons ─────────────────────────────────────

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

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────

interface CustomerBookingCardProps {
  booking: CustomerBookingItem;
  onView: (id: string, type: 'flight' | 'hotel') => void;
  onCancel: (id: string, type: 'flight' | 'hotel') => void;
}

// ─── Component ────────────────────────────────────────────────

export function CustomerBookingCard({ booking, onView, onCancel }: CustomerBookingCardProps) {
  const isCancellable = CUSTOMER_CANCELLABLE_STATUSES.includes(booking.status);
  const { decimalsMap } = useCurrencyData();

  return (
    <div className="group flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 transition-all hover:border-brand-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-800">
      {/* Left: Type icon + info */}
      <div className="flex min-w-0 items-center gap-4">
        {/* Type icon */}
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          booking.type === 'flight'
            ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
            : 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
        }`}>
          {booking.type === 'flight' ? <PlaneIcon className="size-5" /> : <HotelIcon className="size-5" />}
        </div>

        {/* Details */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {booking.type === 'flight'
                ? (booking.description || 'Flight Booking')
                : (booking.hotelName || 'Hotel Booking')
              }
            </p>
            <StatusBadge status={booking.status} />
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <CalendarIcon className="size-3.5" />
              {new Date(booking.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </span>
            {booking.reference && (
              <span className="font-mono text-gray-400">
                Ref: #{booking.reference.substring(0, 8)}
              </span>
            )}
            {booking.type === 'flight' && booking.locatorCode && (
              <span className="font-mono text-gray-400">
                PNR: {booking.locatorCode}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Amount + actions */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            {booking.amount != null && booking.currency
              ? formatCurrencyWithCode(booking.amount, booking.currency, decimalsMap)
              : '—'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onView(booking.id, booking.type)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-500 transition-colors hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20"
            title="View details"
          >
            <EyeIcon className="size-3.5" />
            View
          </button>
          {isCancellable && (
            <button
              onClick={() => onCancel(booking.id, booking.type)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-error-500 transition-colors hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-900/20"
              title="Cancel booking"
            >
              <XCircleIcon className="size-3.5" />
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
