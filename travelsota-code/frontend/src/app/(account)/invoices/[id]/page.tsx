'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useInvoice } from '@/features/invoices/hooks/useInvoice';
import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge';
import { InvoiceDetailSkeleton } from '@/components/invoices/InvoiceSkeleton';
import { getCustomerInvoicePdfUrl, getCustomerInvoicePreviewUrl, getCustomerCreditNotes } from '@/features/invoices/api/customer-invoices';

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

function PrinterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const { data: invoice, isPending } = useInvoice(id);

  const { data: creditNotes } = useQuery({
    queryKey: ['customer', 'invoice', id, 'credit-notes'],
    queryFn: () => getCustomerCreditNotes(id),
    enabled: !!invoice,
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        <InvoiceDetailSkeleton />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center py-16">
        <p className="text-sm font-medium text-gray-500">Invoice not found</p>
        <button onClick={() => router.push('/invoices')} className="mt-4 cursor-pointer text-sm text-brand-teal hover:text-[#012830]">
          Back to invoices
        </button>
      </div>
    );
  }

  const previewUrl = getCustomerInvoicePreviewUrl(id);
  const pdfUrl = getCustomerInvoicePdfUrl(id);

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/invoices')}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="size-4" />
          Back to Invoices
        </button>
        <div className="flex items-center gap-2">
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
          >
            <DownloadIcon className="size-4" />
            PDF
          </a>
          <button
            onClick={() => window.print()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
          >
            <PrinterIcon className="size-4" />
            Print
          </button>
        </div>
      </div>

      {/* Invoice info header */}
      <div className="flex items-start justify-between rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            {invoice.invoiceNumber ?? `Invoice ${invoice.id.substring(0, 8)}`}
          </h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <span className="capitalize">{invoice.bookingType} Booking</span>
            {invoice.createdAt && (
              <span>{new Date(invoice.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            )}
          </div>
        </div>
        <InvoiceStatusBadge status={invoice.status} />
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

      {/* Invoice Preview (iframe) */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Invoice Preview</p>
        </div>
        <iframe
          src={previewUrl}
          className="h-[600px] w-full"
          title="Invoice preview"
          sandbox="allow-scripts"
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#012830]"
        >
          <DownloadIcon className="size-4" />
          Download PDF
        </a>
        <button
          onClick={() => window.print()}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          <PrinterIcon className="size-4" />
          Print
        </button>
      </div>
    </div>
  );
}
