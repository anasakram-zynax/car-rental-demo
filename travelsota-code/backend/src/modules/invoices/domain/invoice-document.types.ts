export type InvoiceDocumentType = 'invoice' | 'credit_note' | 'receipt' | 'voucher';

export interface GeneratedInvoiceDocument {
  id: string;
  bookingId: string;
  bookingType: 'flight' | 'hotel';
  documentType: InvoiceDocumentType;
  invoiceNumber?: string | null;
  creditNoteNumber?: string | null;
  content: string;
  fileName: string;
  pdfBuffer?: Uint8Array;
  status: string;
  createdAt?: string;
}

export interface InvoiceListItem {
  id: string;
  bookingId: string;
  bookingType: string;
  invoiceNumber: string | null;
  creditNoteNumber: string | null;
  fileName: string;
  status: string;
  amount: string | null;
  currency: string | null;
  createdAt: string;
}

export interface PaginatedInvoiceList {
  items: InvoiceListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface InvoiceStats {
  totalInvoices: number;
  generatedInvoices: number;
  emailPendingInvoices: number;
  sentInvoices: number;
  viewedInvoices: number;
  voidInvoices: number;
  currencies: Record<string, string>;
}
