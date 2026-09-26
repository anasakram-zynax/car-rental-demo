'use client';

import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { getCustomerInvoicePdfUrl } from '@/features/invoices/api/customer-invoices';
import type { InvoiceListItem } from '@/features/invoices/api/types';
import { shortInvoiceNumber } from '@/lib/utils/invoice';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

// ponytail: use getCustomerInvoicePdfUrl() instead of window.location.origin for SSR safety

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

interface InvoiceCardProps {
  invoice: InvoiceListItem;
  onView: (id: string) => void;
}

export function InvoiceCard({ invoice, onView }: InvoiceCardProps) {
  const { decimalsMap } = useCurrencyData();
  return (
    <div className="group flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 transition-all hover:border-brand-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-800">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
          <FileTextIcon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white" title={invoice.invoiceNumber ?? undefined}>
              {invoice.invoiceNumber ? `#${shortInvoiceNumber(invoice.invoiceNumber)}` : `INV-${invoice.id.substring(0, 8)}`}
            </p>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>{new Date(invoice.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span className="capitalize">{invoice.bookingType}</span>
            {invoice.amount && invoice.currency && (
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {formatCurrencyWithCode(Number(invoice.amount), invoice.currency, decimalsMap)}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => onView(invoice.id)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-500 transition-colors hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20"
        >
          View
        </button>
        <a
          href={getCustomerInvoicePdfUrl(invoice.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-gray-800"
        >
          <DownloadIcon className="size-3.5" />
          PDF
        </a>
      </div>
    </div>
  );
}
