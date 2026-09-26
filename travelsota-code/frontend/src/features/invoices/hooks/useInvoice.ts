'use client';

import { useQuery } from '@tanstack/react-query';
import { getCustomerInvoice } from '../api/customer-invoices';

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getCustomerInvoice(id),
    enabled: !!id,
  });
}
