import { adminRequest } from '@/lib/api/admin-client';

export interface AgentInvoiceItem {
  id: string;
  bookingId: string;
  bookingType: string;
  fileName: string;
  status: string;
  createdAt: string;
}

export function getAgentInvoices(userId: string) {
  return adminRequest<{ items: AgentInvoiceItem[] }>(`/admin/agents/${userId}/invoices`);
}
