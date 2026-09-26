'use client';
import { useTranslations } from 'next-intl';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getCustomerBookings, CUSTOMER_CANCELLABLE_STATUSES, type CustomerBookingItem } from '@/features/bookings/api/customer-bookings';
import { getCustomerWalletBalance } from '@/features/wallet/api/customer-wallet';
import { useInvoices } from '@/features/invoices/hooks/useInvoices';
import { useCurrency } from '@/context/CurrencyContext';
import { shortInvoiceNumber } from '@/lib/utils/invoice';

function PlaneIcon({ className }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>);
}
function HotelIcon({ className }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V3h18v18" /><path d="M3 7h18" /><path d="M3 11h18" /><path d="M3 15h18" /><path d="M7 3v18" /><path d="M11 15h2v6h-2z" /></svg>);
}
function InvoiceIcon({ className }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>);
}
function WalletIcon({ className }: { className?: string }) {
  return (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>);
}

function StatCard({ label, value, icon, accent }: { label: string; value: string; icon: ReactNode; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent}`}>{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function statusTone(status: string) {
  if (['booked', 'held', 'confirmed', 'completed'].includes(status)) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400';
  if (['pending_payment', 'held_pending_payment', 'pending', 'booking_in_progress'].includes(status)) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';
  if (['cancelled', 'failed'].includes(status)) return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
}

export default function DashboardOverviewPage() {
  const t = useTranslations('Account');
  const { formatPrice, convertAmount, selectedCurrency } = useCurrency();
  const { data: bookings } = useQuery<CustomerBookingItem[]>({ queryKey: ['customer', 'bookings'], queryFn: getCustomerBookings });
  const { data: invoices } = useInvoices({ limit: 5 });
  const { data: wallet } = useQuery({ queryKey: ['customer', 'wallet', 'balance'], queryFn: getCustomerWalletBalance });

  const stats = useMemo(() => {
    const list = bookings ?? [];
    const active = list.filter((b) => CUSTOMER_CANCELLABLE_STATUSES.includes(b.status)).length;
    const items = invoices?.items ?? [];
    // Invoices can span currencies — convert each into the selected display
    // currency BEFORE summing (convert-then-sum). Summing raw amounts and
    // labeling the total with one currency misstates mixed-currency totals.
    const spent = items.reduce((sum, i) => {
      const amt = Number(i.amount) || 0;
      const cur = (i.currency ?? 'USD').toUpperCase();
      if (!amt) return sum;
      return sum + (cur === selectedCurrency.code ? amt : convertAmount(amt, cur));
    }, 0);
    return {
      total: list.length,
      active,
      invoices: invoices?.total ?? 0,
      spent,
      currency: selectedCurrency.code,
    };
  }, [bookings, invoices, convertAmount, selectedCurrency.code]);

  const recentBookings = (bookings ?? []).slice(0, 4);
  const recentInvoices = (invoices?.items ?? []).slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-teal to-[#012830] p-6 text-white sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-white/70">Your travel, all in one place</p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">Plan, book and manage every trip</h2>
            <p className="mt-2 max-w-xl text-sm text-white/70">Track bookings, download invoices and update your profile — wherever you are.</p>
          </div>
          <Link href="/flights" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-brand-teal shadow-lg transition-transform hover:-translate-y-0.5">
            <PlaneIcon className="h-4 w-4" /> Book a trip
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Trips" value={String(stats.total)} icon={<PlaneIcon className="h-5 w-5 text-brand-teal" />} accent="bg-brand-teal/10" />
        <StatCard label="Active Trips" value={String(stats.active)} icon={<HotelIcon className="h-5 w-5 text-brand-teal" />} accent="bg-brand-teal/10" />
        <StatCard label="Invoices" value={String(stats.invoices)} icon={<InvoiceIcon className="h-5 w-5 text-brand-teal" />} accent="bg-brand-teal/10" />
        <StatCard label="Total Spent" value={formatPrice(stats.spent, stats.currency)} icon={<WalletIcon className="h-5 w-5 text-brand-teal" />} accent="bg-brand-teal/10" />
        <StatCard label="Wallet Balance" value={formatPrice(wallet?.walletBalance ?? 0, wallet?.currency ?? stats.currency)} icon={<WalletIcon className="h-5 w-5 text-brand-teal" />} accent="bg-brand-teal/10" />
      </div>
      <div className="flex justify-end">
        <Link href="/wallet" className="text-xs font-medium text-brand-teal hover:underline">Manage wallet</Link>
      </div>

      {/* Recent trips + invoices */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Trips</h3>
            <Link href="/bookings" className="text-xs font-medium text-brand-teal hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentBookings.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No trips yet.</p>
            ) : recentBookings.map((b) => (
              <Link key={`${b.type}-${b.id}`} href="/bookings" className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                  {b.type === 'flight' ? <PlaneIcon className="h-4 w-4" /> : <HotelIcon className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{b.description || b.hotelName || `${b.type} booking`}</p>
                  <p className="truncate text-xs text-slate-400">{b.reference || b.locatorCode || '—'} · {new Date(b.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${statusTone(b.status)}`}>{b.status.replace(/_/g, ' ')}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Invoices</h3>
            <Link href="/invoices" className="text-xs font-medium text-brand-teal hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentInvoices.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No invoices yet.</p>
            ) : recentInvoices.map((inv) => (
              <Link key={inv.id} href={`/invoices`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal"><InvoiceIcon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{inv.invoiceNumber ? `#${shortInvoiceNumber(inv.invoiceNumber)}` : inv.creditNoteNumber || 'Document'}</p>
                  <p className="truncate text-xs text-slate-400">{inv.bookingType} · {new Date(inv.createdAt).toLocaleDateString()}</p>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{inv.amount ? formatPrice(Number(inv.amount), inv.currency ?? 'USD') : '—'}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
