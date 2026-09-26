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

export interface GeneratedInvoiceDocument {
  id: string;
  bookingId: string;
  bookingType: 'flight' | 'hotel';
  documentType: string;
  invoiceNumber?: string | null;
  creditNoteNumber?: string | null;
  content: string;
  fileName: string;
  pdfBuffer?: Uint8Array;
  status: string;
  createdAt?: string;
}

export interface InvoiceStats {
  totalInvoices: number;
  generatedInvoices: number;
  sentInvoices: number;
  viewedInvoices: number;
  voidInvoices: number;
  totalAmount: string;
  currencies: Record<string, string>;
}

export interface InvoiceListFilters {
  page?: number;
  limit?: number;
  q?: string;
  userId?: string;
  bookingType?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  documentType?: 'invoice' | 'credit_note' | 'receipt';
}
