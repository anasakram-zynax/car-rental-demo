'use client';

import { useQuery } from '@tanstack/react-query';
import { getCustomerInvoices } from '../api/customer-invoices';
import type { InvoiceListFilters } from '../api/types';

export function useInvoices(filters?: InvoiceListFilters) {
  return useQuery({
    queryKey: ['invoices', 'customer', filters],
    queryFn: () => getCustomerInvoices(filters),
  });
}
