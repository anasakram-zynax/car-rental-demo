'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getAgentInvoice, getAgentInvoicePreviewUrl, getAgentInvoicePdfUrl } from '@/features/invoices/api/agent-invoices';
import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge';
import { InvoiceDetailSkeleton } from '@/components/invoices/InvoiceSkeleton';

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

export default function AgentInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const { data: invoice, isPending } = useQuery({
    queryKey: ['agent', 'invoice', id],
    queryFn: () => getAgentInvoice(id),
  });

  if (isPending) {
    return <InvoiceDetailSkeleton />;
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center py-16">
        <p className="text-sm font-medium text-gray-500">Invoice not found</p>
        <button onClick={() => router.push('/agent/invoices')} className="mt-4 cursor-pointer text-sm text-brand-500 hover:text-brand-600">
          Back to invoices
        </button>
      </div>
    );
  }

  const creditNotes = (invoice as any).creditNotes;

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => router.push('/agent/invoices')}
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

      {/* Actions */}
      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        <button
          onClick={() => window.open(getAgentInvoicePdfUrl(id), '_blank')}
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-brand-200 hover:shadow-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <DownloadIcon className="size-5 text-brand-500" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Download PDF</p>
            <p className="text-xs text-gray-500">View or save the invoice</p>
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
            {creditNotes.map((cn: any) => (
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
          src={getAgentInvoicePreviewUrl(id)}
          className="h-[600px] w-full"
          title="Invoice preview"
          sandbox="allow-scripts"
        />
      </div>
    </div>
  );
}
