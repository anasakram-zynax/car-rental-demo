'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { getAdminInvoice, regenerateInvoice, voidInvoice, sendInvoiceEmail, createCreditNote, getAdminCreditNotes, getAdminInvoicePreviewUrl, getAdminInvoicePdfUrl } from '@/features/invoices/api/admin-invoices';
import { apiRequest } from '@/lib/api/client';
import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge';
import { InvoiceDetailSkeleton } from '@/components/invoices/InvoiceSkeleton';
import { useToast } from '@/hooks/useToast';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

function ArrowLeft({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
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

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function BanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}

interface CostMarginData {
  amount: number | null;
  currency: string;
  supplierAmount: number | null;
  supplierCurrency?: string | null;
  markupAmount: number | null;
  customerAmount: number | null;
}

/**
 * Internal cost & margin breakdown for the linked booking.
 *
 * The tax invoice itself intentionally stays customer-safe (no supplier cost
 * or margin lines) — this admin-only panel is where staff verify the numbers
 * behind the document: supplier base + markup = customer total.
 */
function CostMarginPanel({ bookingId }: { bookingId: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['admin', 'invoice-cost-margin', bookingId],
    queryFn: () =>
      apiRequest<CostMarginData>(`/admin/bookings/${bookingId}/detail`, { auth: true }),
    retry: false,
  });
  const { decimalsMap } = useCurrencyData();

  if (isPending) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Cost &amp; Margin</p>
        <div className="mt-3 h-4 w-40 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (isError || !data) return null;

  const supplierCode = data.supplierCurrency ?? data.currency;
  const fmt = (v: number | null | undefined, currency: string = data.currency) =>
    v != null ? formatCurrencyWithCode(Number(v), currency, decimalsMap) : '—';
  const supplier = data.supplierAmount != null ? Number(data.supplierAmount) : null;
  const markup = data.markupAmount != null ? Number(data.markupAmount) : null;
  const total = data.amount ?? data.customerAmount;
  // Corrupt legacy rows (markup ≥ total) are not plausible margins — hide them.
  const plausible =
    markup != null && supplier != null && total != null &&
    markup > 0 && markup < Number(total);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-700">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Cost &amp; Margin <span className="ml-1 normal-case text-gray-400">(internal — not shown to customers)</span>
        </p>
      </div>
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Supplier Base</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{fmt(supplier, supplierCode)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Markup (Earnings)</p>
          <p className={`mt-1 text-sm font-semibold tabular-nums ${plausible ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
            {plausible ? `+${fmt(markup)}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Customer Total</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{fmt(total)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Margin</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
            {plausible && supplier != null && supplier > 0 && markup != null
              ? `${((markup / supplier) * 100).toFixed(1)}%`
              : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const queryClient = useQueryClient();
  const toasts = useToast();

  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [creditNoteReason, setCreditNoteReason] = useState('');
  const [creditNoteAmount, setCreditNoteAmount] = useState('');

  const { data: invoice, isPending } = useQuery({
    queryKey: ['admin', 'invoice', id],
    queryFn: () => getAdminInvoice(id),
  });

  const { data: creditNotes } = useQuery({
    queryKey: ['admin', 'invoice', id, 'credit-notes'],
    queryFn: () => getAdminCreditNotes(id),
    enabled: !!invoice && invoice.status !== 'void',
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invoice', id] });
      toasts.success('Invoice regenerated', 'The invoice PDF has been re-rendered.');
    },
    onError: (err: any) => toasts.error('Regeneration failed', err?.message ?? 'Unable to regenerate invoice.'),
  });

  const voidMutation = useMutation({
    mutationFn: () => voidInvoice(id, voidReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'invoice', id, 'credit-notes'] });
      setShowVoidModal(false);
      toasts.success('Invoice voided', 'The invoice has been voided.');
    },
    onError: (err: any) => toasts.error('Void failed', err?.message ?? 'Unable to void invoice.'),
  });

  const emailMutation = useMutation({
    mutationFn: () => sendInvoiceEmail(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invoice', id] });
      toasts.success('Email queued', 'The invoice has been queued for email delivery.');
    },
    onError: (err: any) => toasts.error('Email failed', err?.message ?? 'Unable to queue email.'),
  });

  const creditNoteMutation = useMutation({
    mutationFn: () =>
      createCreditNote({
        bookingId: invoice!.bookingId,
        originalInvoiceId: id,
        reason: creditNoteReason || undefined,
        refundAmount: creditNoteAmount ? Number(creditNoteAmount) : undefined,
      }),
    onSuccess: (newDoc) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'invoice', id, 'credit-notes'] });
      setShowCreditNoteModal(false);
      setCreditNoteReason('');
      setCreditNoteAmount('');
      toasts.success(
        'Credit note created',
        `${newDoc.creditNoteNumber ?? 'CN'} has been generated.`,
      );
    },
    onError: (err: any) => toasts.error('Failed to create credit note', err?.message ?? 'Unable to create credit note.'),
  });

  if (isPending) {
    return <InvoiceDetailSkeleton />;
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center py-16">
        <p className="text-sm font-medium text-gray-500">Invoice not found</p>
        <button onClick={() => router.push('/admin/invoices')} className="mt-4 cursor-pointer text-sm text-brand-teal-500 hover:text-brand-teal-600">
          Back to invoices
        </button>
      </div>
    );
  }

  const isVoidable = !['void', 'refunded'].includes(invoice.status);

  return (
    <RequirePagePermission permissions={[PermissionCode.INVOICES_READ]}>
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => router.push('/admin/invoices')}
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="size-4" />
        Back to Invoices
      </button>

      {/* Header */}
      <div className="flex items-start justify-between rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            {invoice.invoiceNumber ?? `Invoice ${id.substring(0, 8)}`}
          </h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <span className="capitalize">{invoice.bookingType} Booking</span>
            <span>ID: {invoice.bookingId.substring(0, 8)}…</span>
            {invoice.createdAt && <span>{new Date(invoice.createdAt).toLocaleDateString()}</span>}
          </div>
        </div>
        <InvoiceStatusBadge status={invoice.status} />
      </div>

      {/* Action Cards */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <button
          onClick={() => window.open(getAdminInvoicePdfUrl(id), '_blank')}
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-brand-teal-200 hover:shadow-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <DownloadIcon className="size-5 text-brand-teal-500" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Download PDF</p>
            <p className="text-xs text-gray-500">View or save the invoice</p>
          </div>
        </button>

        <button
          onClick={() => emailMutation.mutate()}
          disabled={emailMutation.isPending}
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-blue-200 hover:shadow-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900"
        >
          <MailIcon className="size-5 text-blue-500" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Send Email</p>
            <p className="text-xs text-gray-500">Queue for delivery</p>
          </div>
        </button>

        <button
          onClick={() => regenerateMutation.mutate()}
          disabled={regenerateMutation.isPending || !isVoidable}
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-amber-200 hover:shadow-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900"
        >
          <RefreshIcon className="size-5 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Regenerate</p>
            <p className="text-xs text-gray-500">Re-render the PDF</p>
          </div>
        </button>

        <button
          onClick={() => setShowVoidModal(true)}
          disabled={!isVoidable}
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-red-200 hover:shadow-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900"
        >
          <BanIcon className="size-5 text-red-500" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Void Invoice</p>
            <p className="text-xs text-gray-500">Mark as void</p>
          </div>
        </button>

        <button
          onClick={() => setShowCreditNoteModal(true)}
          disabled={!isVoidable}
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-emerald-200 hover:shadow-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900"
        >
          <svg className="size-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Credit Note</p>
            <p className="text-xs text-gray-500">Issue a refund</p>
          </div>
        </button>
      </div>

      {/* Linked Credit Notes */}
      {creditNotes && creditNotes.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-700">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Credit Notes ({creditNotes.length})
            </p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {creditNotes.map((cn) => (
              <div key={cn.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <svg className="size-4 shrink-0 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {cn.creditNoteNumber ?? cn.id.substring(0, 8)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {cn.currency} {cn.amount} &middot; {new Date(cn.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <InvoiceStatusBadge status={cn.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice Preview */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-700">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Invoice Preview</p>
        </div>
        <iframe
          src={getAdminInvoicePreviewUrl(id)}
          className="h-[600px] w-full"
          title="Invoice preview"
          sandbox="allow-scripts"
        />
      </div>

      {/* Internal cost & margin breakdown (admin-only, never rendered on customer documents) */}
      {invoice.bookingType === 'hotel' && <CostMarginPanel bookingId={invoice.bookingId} />}

      {/* Credit Note Creation Modal */}
      {showCreditNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!creditNoteMutation.isPending) setShowCreditNoteModal(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create Credit Note</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              This will create a credit note linked to this invoice and mark it as refunded.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Refund Amount (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={creditNoteAmount}
                  onChange={(e) => setCreditNoteAmount(e.target.value)}
                  placeholder="Full booking amount if empty…"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Reason (optional)</label>
                <textarea
                  value={creditNoteReason}
                  onChange={(e) => setCreditNoteReason(e.target.value)}
                  placeholder="e.g. Booking cancellation, partial refund…"
                  rows={2}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button onClick={() => setShowCreditNoteModal(false)} disabled={creditNoteMutation.isPending}
                className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={() => creditNoteMutation.mutate()} disabled={creditNoteMutation.isPending}
                className="flex-1 cursor-pointer rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:opacity-50">
                {creditNoteMutation.isPending ? 'Creating…' : 'Create Credit Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Confirmation Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!voidMutation.isPending) setShowVoidModal(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Void Invoice</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              This will mark the invoice as void. This action cannot be undone.
            </p>
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Reason</label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Duplicate invoice, incorrect amount…"
                rows={2}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button onClick={() => setShowVoidModal(false)} disabled={voidMutation.isPending}
                className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={() => voidMutation.mutate()} disabled={voidMutation.isPending || !voidReason.trim()}
                className="flex-1 cursor-pointer rounded-xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-600 disabled:opacity-50">
                {voidMutation.isPending ? 'Voiding…' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </RequirePagePermission>
  );
}
